---
type: Design Doc
title: 設計
description: 筋トレ管理サイトのアーキテクチャ・データモデル・画面構成
tags: [筋トレ管理, design]
timestamp: 2026-07-20T00:00:00Z
---
# 設計

対応する要件は [requirements.md](requirements.md) を参照。

## 0. 移行の経緯(2026-08時点)

初期実装はGoogle スプレッドシート + Google Apps Scriptで構築していたが、運用の中で以下の問題が繰り返し発生した。

- 「記録の追加・編集・削除のたびに『現在値』セルを再計算して書き込む」設計が、スキーマ不一致による誤上書き(実際に発生したデータ破損)や、再計算忘れによる値のズレを繰り返し引き起こした
- Apps Script特有の運用摩擦(デプロイの新バージョン化忘れ、コピー&ペースト時のNUL文字混入・行数制限など)

これを受けて、データストアをユーザーが既に契約しているXServer(スタンダードプラン)のMySQL/MariaDB 10.5へ移行する。最大の狙いは、**「現在値」を書き込み時にキャッシュ・再計算する方式を廃止し、読み取り時にSQLで都度計算する方式に変える**こと。これにより「再計算し忘れ」「再計算が誤った列に書き込まれる」というバグのクラスを構造的に無くす。

## 0.1 マルチユーザー化への転換(2026-08時点)

当初は自分専用ツール(秘密パスによる書き込み保護、誰でも見られる公開閲覧サイト付き)として構築したが、将来的に無料で一般公開し、複数のユーザーが使える製品に育てる方針に転換した([requirements.md](requirements.md) §0)。これに伴う主な設計変更:

- 秘密パスによる書き込み保護 → 通常のログイン認証(セッションCookie、Google OAuth / メールアドレス・パスワード)に置き換え
- 「誰でも見られる公開サイト」+「秘密パスの入力ページ」という2アプリ構成 → ログイン必須の単一ダッシュボードアプリに統合
- `cycles`(サイクル)は全ユーザー共通の固定4行 → ユーザーごとに自由に作成・編集できるテーブルに変更
- 新規テーブル: `users`・`body_weight_logs`・`password_reset_tokens`
- 旧アーキテクチャ(公開サイト/秘密パス方式)の詳細は [architecture.md](architecture.md) の「過去のアーキテクチャからの変更」に記録する

## 1. アーキテクチャ

```
[ユーザー] --ログイン(メール/パスワード or Google)--> [XServer: ダッシュボード(静的HTML、SPA)]
                                                              │ 同一オリジン・セッションCookie付きfetch
                                                              ▼
                                                    [認証必須API(PHP)] --PDO--> [MySQL/MariaDB]
```

- ダッシュボードアプリ(静的HTML)は、ログイン画面・サインアップ画面・オンボーディング・管理表タブ・グラフタブ・体重タブ・プロフィール設定を1つのSPAとして提供し、`workout.tamachan-blog.com/`直下にビルド済み成果物をFTPで配置する
- APIはすべて`workout.<domain>/api/`に集約する。全エンドポイントがログイン必須で、旧来の「公開読み取りAPI」と「秘密パスAPI」の区別は廃止する
- ドメインは当面`workout.tamachan-blog.com`を継続利用する。フロント・APIとも相対パス・`.env`設定に依存する作りのため、将来独立ドメインへ移行する場合もコードの作り直しは不要(DNS/SSL設定とデプロイ先の変更のみで済む)
- ソースコード(GitHubリポジトリ)はソース管理としてのみ利用し、GitHub Pages等のホスティング機能は使わない(変更なし)

### 1.1 認証方式

| 方式 | 概要 |
| :--- | :--- |
| メール/パスワード | `password_hash()`(bcrypt)でハッシュ化して`users.password_hash`に保存する。ログインは`password_verify()`で照合する |
| Googleログイン | 標準的なOAuth2 Authorization Codeフローを使う。認可コードをGoogleのトークンエンドポイントに交換し、取得したアクセストークンで`userinfo`エンドポイントからメールアドレス・`sub`(Google側の一意ID)を取得する。**IDトークンのJWT署名検証はサーバー側で自前実装しない**(本番にComposerの`vendor/`をデプロイしない方針のため)。`userinfo`エンドポイントへのHTTPS呼び出し自体がGoogle側で検証済みのデータを返すため、自前でJWT検証を実装する必要がない |
| セッション | PHPネイティブセッション(`session_start()`)。Cookieには`HttpOnly`・`Secure`・`SameSite=Lax`を設定する |
| パスワードリセット | `password_reset_tokens`に、ランダムトークンの**ハッシュ値のみ**を保存する(トークン本体はメール本文にのみ含め、DBには残さない)。有効期限を設ける |
| CSRF対策 | 状態変更系(POST)のAPIは、単純なクロスサイトフォーム送信では付与できないカスタムヘッダー(`X-Requested-With`等)を必須にする。`SameSite=Lax`と合わせて、個人開発の小規模サービスとして現実的な防御レベルとする |
| メール送信 | XServerの標準プランに含まれるメールアカウント機能を使う(追加契約不要)。パスワードリセットメールの到達率を確保するため、XServerのサーバーパネルでSPF/DKIMを設定する |
| レート制限 | ログイン試行の総当たり対策として、`users`に失敗回数・直近失敗日時を持たせ、一定回数連続失敗した場合は短時間ロックする程度の簡易実装に留める(小規模サービスのためYAGNI) |

### 1.2 データ分離の方針(重要)

`cycles`・`exercises`・`logs`・`body_weight_logs`の**全テーブルに`user_id`を直接持たせる**(`cycles`経由の間接参照だけに頼らない)。各APIエンドポイントは必ずログイン中の`user_id`でWHERE句を絞り込み、リクエストパラメータで送られてきた`user_id`は一切信用しない。

理由: `exercises`→`cycles`→`user_id`のようなJOIN経由の間接的な認可チェックだけに頼ると、将来クエリが増えた際にJOINを書き忘れて他人のデータが漏れる事故が起こりうる。テーブルごとに直接絞り込める形にすることで、この種の事故を構造的に防ぐ。

### 1.3 アカウント削除の実装方針(US-16対応)

`ON DELETE CASCADE`には頼らず、`logs` → `body_weight_logs` → `exercises` → `cycles` → `users`の順に、1つのトランザクション内で明示的に削除する。

理由: 複数のテーブルがそれぞれ`user_id`経由で`users`に`CASCADE`を設定すると、MySQLは各テーブルの削除順序を保証しないため、`exercises.cycle_id → cycles`のような別経路のFK制約(`RESTRICT`)と組み合わさったときに、削除順序次第で外部キー制約違反が起こりうる。アカウント削除は取り消せない重大な操作でもあるため、順序を明示したコードで確実に・監査しやすく実装する。

| 要素 | 使用サービス | 費用 |
| :--- | :--- | :--- |
| ダッシュボード・API実行環境・データ保存 | XServer(スタンダードプラン、MySQL/MariaDB + PHP) | 既存契約内(追加費用なし) |
| メール送信(パスワードリセット等) | XServer標準プラン付属のメールアカウント機能 | 既存契約内(追加費用なし) |
| Googleログイン | Google Cloud の OAuth 2.0 クライアント(無料枠) | 無料 |
| ソースコード管理 | GitHub(ホスティングには使わない) | 無料 |
| フロントエンド技術スタック | Vite + TypeScript(素、フレームワークなし) | 無料 |
| グラフ描画ライブラリ | Chart.js | 無料 |

**CORS**: ダッシュボード・APIは同一オリジン(`workout.tamachan-blog.com`)のため、本番運用上はCORSヘッダー自体が不要。ただしローカル開発時(`npm run dev`の`localhost`)からAPIを呼べるよう、許可オリジンのホワイトリストに`http://localhost:5173`を含めている(`php/private/.env`の`PUBLIC_CORS_ORIGINS`)。

## 2. データモデル(MySQL/MariaDB)

### 2.1 `users` テーブル — ユーザーアカウント(新規)

```sql
CREATE TABLE users (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email          VARCHAR(255) NULL,
  password_hash  VARCHAR(255) NULL,
  google_sub     VARCHAR(255) NULL,          -- Googleログイン利用者の一意ID(sub)
  display_name   VARCHAR(100) NOT NULL,
  birth_date     DATE NULL,
  gender         ENUM('male', 'female', 'unspecified') NOT NULL DEFAULT 'unspecified',
  failed_login_count     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  failed_login_at        DATETIME NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_google_sub (google_sub)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- `email`・`password_hash`・`google_sub`はいずれもNULL許容だが、アプリ側で「`email`+`password_hash`の組」または「`google_sub`」のどちらか一方は必ず設定されることを保証する
- **Googleログインとメール/パスワードアカウントの統合**: `email`には`UNIQUE`制約があるため、既にメール/パスワードで登録済みのメールアドレスと同じGoogleアカウントでログインしようとすると、素朴に新規ユーザーを作成しようとして制約違反になる(実際に本番で発生した不具合)。`google_callback.php`では、`google_sub`で見つからない場合、Google側で`email_verified`が真のメールアドレスに限り、既存のメール/パスワードアカウントを検索して`google_sub`を後付けで紐づける(`link_google_to_user`)。これにより、同じメールアドレスであれば「メール/パスワードでもGoogleでも同じアカウントに入れる」という直感的な挙動になる
- `birth_date`・`gender`は任意項目(US-14)。`gender`は将来のカロリー計算機能でBMR計算式の係数として使う可能性があるための保持で、今回は保持のみでスコープ外([requirements.md](requirements.md) §4)

### 2.2 `password_reset_tokens` テーブル — パスワードリセット用トークン(新規)

```sql
CREATE TABLE password_reset_tokens (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64) NOT NULL,             -- ランダムトークンのSHA-256。トークン本体はDBに残さない
  expires_at  DATETIME NOT NULL,
  used_at     DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_reset_tokens_token_hash (token_hash),
  CONSTRAINT fk_password_reset_tokens_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

このテーブルは`users`以外に子テーブルを持たない独立した子テーブルなので、§1.3のような削除順序の懸念がなく`ON DELETE CASCADE`で問題ない。

### 2.3 `cycles` テーブル — サイクル(ユーザーごとに自由に定義)

```sql
CREATE TABLE cycles (
  id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  label   VARCHAR(20) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cycles_user_id_label (user_id, label),
  CONSTRAINT fk_cycles_user_id FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- 旧設計では全ユーザー共通の固定4行(Push/Pull/Legs/Rest)だったが、US-12・US-13対応でユーザーごとに自由に作成・編集できるテーブルに変更する。明示的な並び順の列は持たず、`id`昇順(作成順)をそのまま表示順とする(YAGNI。手動並び替えが欲しくなったら列を足す)
- 「休憩」を表す特別なサイクル種別は持たない。オンボーディングのテンプレート(§2.7)で「Rest」という名前のサイクルを提示することはできるが、アプリ側では他のサイクルと同じ扱いになる(旧設計にあった「サイクル=Restなら種目名『休憩』の1行のみ表示」という特別扱いは廃止し、種目が0件のサイクルは自然に空の一覧として表示される)

### 2.4 `exercises` テーブル — 種目の基本情報・目標値

```sql
CREATE TABLE exercises (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED NOT NULL,
  cycle_id        INT UNSIGNED NOT NULL,           -- 種目は常にいずれかのサイクルに属する(廃止後も元のサイクルを保持する)
  is_discontinued TINYINT(1) NOT NULL DEFAULT 0,    -- 1 = 現在は行っていない種目
  name            VARCHAR(255) NOT NULL,
  target_weight   DECIMAL(5,2) NULL,                -- NULLは「目標重量なし」(旧"-")
  target_reps     SMALLINT UNSIGNED NULL,
  target_sets     SMALLINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exercises_cycle_id_name (cycle_id, name),
  CONSTRAINT fk_exercises_user_id FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_exercises_cycle_id FOREIGN KEY (cycle_id) REFERENCES cycles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- `user_id`を直接持つ(§1.2の方針)。`cycle_id`も併せて持つため冗長に見えるが、`cycle_id`は「どのサイクルに属するか」という意味情報、`user_id`は「誰のデータか」という認可情報であり、役割が異なる
- それ以外の設計判断は旧設計から変更なし: `id`が実PK、`category`列は持たない(`cycle_id`への推移的従属になるため)、「廃止」は`is_discontinued`フラグで表現し`cycle_id`は保持したままにする、現在値の列は持たない(2.6の通り読み取り時に算出)、目標値は単一のスカラー値(複数期間対応はスコープ外)

### 2.5 `logs` テーブル — トレーニングごとの実績

```sql
CREATE TABLE logs (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED NOT NULL,
  exercise_id   INT UNSIGNED NOT NULL,
  logged_date   DATE NOT NULL,
  set_number    SMALLINT UNSIGNED NOT NULL,
  weight        DECIMAL(5,2) NULL,          -- NULL = 重量なし種目のセット
  reps          SMALLINT UNSIGNED NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logs_exercise_id_logged_date (exercise_id, logged_date),
  CONSTRAINT fk_logs_user_id FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_logs_exercise_id FOREIGN KEY (exercise_id)
    REFERENCES exercises(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- `user_id`を直接持つ(§1.2の方針)。それ以外は旧設計から変更なし: `id`はDBの`AUTO_INCREMENT`、列名は予約語衝突を避けて`logged_date`、`weight`は`DECIMAL(5,2)`(浮動小数点誤差による現在値グルーピング分裂を避けるため)、`ON DELETE RESTRICT`によりログが紐づく種目は削除不可(物理削除は記録が0件の種目のみ、それ以外は`is_discontinued`で運用)

### 2.6 `body_weight_logs` テーブル — 体重の推移(新規、US-15対応)

```sql
CREATE TABLE body_weight_logs (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  logged_date DATE NOT NULL,
  weight      DECIMAL(5,2) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_body_weight_logs_user_id_logged_date (user_id, logged_date),
  KEY idx_body_weight_logs_user_id_logged_date (user_id, logged_date),
  CONSTRAINT fk_body_weight_logs_user_id FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

1日1件の記録を前提とし、`(user_id, logged_date)`をユニーク制約にする。同じ日に再送信した場合は`add_body_weight`側で既存行をUPSERT(上書き)する(トレーニング記録のような1日複数セットの概念が体重にはないため、種目記録とは異なり単純な時系列として扱う)。

### 2.7 サイクル初期設定テンプレート(US-12対応)

DBテーブルは持たない。フロントエンドの静的な設定値として、以下のようなテンプレートを用意し、オンボーディング画面で選択させる。選択すると、そのユーザーの`cycles`に一括で行を作成する(種目は含まない。作成後にUS-7の操作で追加する)。

```
- 4分割: Push / Pull / Legs / Rest
- 3分割: Push / Pull / Legs
- 2分割: Upper / Lower
- フルボディ: Full Body
- (テンプレートを使わず、ゼロから自分でサイクルを作る)
```

### 2.8 重量なし種目の扱い(バリデーション)

エアロバイク・クランチ等、目標重量が無い種目は、記録の重量欄も空欄で送信可能とする。それ以外の種目は重量を必須項目として扱う。回数は全種目で必須。

ただし目標重量が無いのは「重量を使わない種目」だけでなく「廃止されて目標が無くなった種目」もあり得る。これらを区別するため、`is_weight_based`という真偽値を**読み取り時にSQLで判定**して`getBoard`のレスポンスに含める。

```sql
(e.target_weight IS NOT NULL
  OR EXISTS (SELECT 1 FROM logs l WHERE l.exercise_id = e.id AND l.weight IS NOT NULL)
) AS is_weight_based
```

1. 目標重量が設定されていれば、重量あり種目として確定する
2. 目標重量が無い場合、その種目の記録に重量ありの実績が過去に1件でもあれば「重量あり種目」、一度も無ければ「重量なし種目」とする

フロントエンド側はこの`is_weight_based`フラグを信頼するだけでよく、クライアント側で同じ判定ロジックを再実装しない。

### 2.9 「現在値」の自動算出ロジック(US-2対応、読み取り時に計算)

種目(`exercise_id`で特定)ごとに、記録の中から**直近の記録日**のデータを対象にする。

その日に行った**(重量, 回数)の組ごとにグルーピング**し、それぞれのグループを「重量・回数・そのセット数」として返す。ドロップセットのように日の中で重量が変わる場合でも、実際に行った組み合わせだけを正確に表現できる(例: 60kg×3回を1セット、50kg×10回を1セット、40kg×12回を3セット、という3グループ)。

`getBoard`用の一括クエリ(ログイン中のユーザーの全種目分を1回で取得):

```sql
SELECT l.exercise_id, l.weight, l.reps, COUNT(*) AS sets
FROM logs l
INNER JOIN (
  SELECT exercise_id, MAX(logged_date) AS max_date FROM logs WHERE user_id = :user_id GROUP BY exercise_id
) latest ON latest.exercise_id = l.exercise_id AND latest.max_date = l.logged_date
WHERE l.user_id = :user_id
GROUP BY l.exercise_id, l.weight, l.reps
ORDER BY l.exercise_id, l.weight DESC, l.reps DESC;
```

- 重量が全行`NULL`の種目(重量なし種目)は`GROUP BY weight, reps`が自動的に`reps`だけのグルーピングに縮退し、`ORDER BY weight DESC`も無効化される(全部NULLで同着)ため、**重量あり・なしで別クエリを用意する必要がない**
- 記録が0件の種目は現在値が空配列になる(特別扱い不要)
- PHP側でこの結果を`exercise_id`ごとにバケット分けし、`exercises`の一覧にアタッチする

記録ログへの追記・修正・削除があっても、**書き込み時に何かを再計算・保存する必要はない**。次に読み取られたときに常に最新の実データを反映する。

### 2.10 API仕様

レスポンス形式は英語キー・構造化配列。`cycle`は`cycles`テーブルとJOINしたラベル込みのオブジェクトとして返す(廃止済み種目も元のサイクルのまま。`is_discontinued`で区別する)。

```json
{
  "id": 5, "cycle": { "id": 1, "label": "Push" }, "is_discontinued": false, "name": "バーベルベンチプレス",
  "is_weight_based": true,
  "target": { "weight": 80, "reps": 12, "sets": 3 },
  "current": [
    { "weight": 60, "reps": 3, "sets": 1 },
    { "weight": 50, "reps": 10, "sets": 1 },
    { "weight": 40, "reps": 12, "sets": 3 }
  ]
}
```

`current`配列は2.9のクエリの通り重量の降順で返す(上の例なら60→50→40kgの順)。フロントエンドは並び替えをせず、返ってきた順にそのまま表示してよい。

各PHPファイルは共通のレスポンス形式(`{"ok":true,...}` / `{"ok":false,"error":"..."}`)を返す。PDO+プリペアドステートメントのみを使用し、文字列連結SQLは書かない。DB接続・クエリ・レスポンスヘルパー・認証チェック等の共通ロジックは、全エンドポイントから共有する1箇所に置く(コピペで二重管理にしない)。

#### 認証API(`workout.<domain>/api/auth/`、ログイン不要で呼び出せる)
| endpoint | method | payload | response |
| :--- | :--- | :--- | :--- |
| `signup.php` | POST | `{email, password, display_name}` | `{ok:true}`(成功時セッション開始) |
| `login.php` | POST | `{email, password}` | `{ok:true}`(成功時セッション開始) |
| `logout.php` | POST | - | `{ok:true}` |
| `google_start.php` | GET | - | Googleの認可画面へリダイレクト |
| `google_callback.php` | GET | `code`(クエリ) | 成功時セッション開始しダッシュボードへリダイレクト |
| `password_reset_request.php` | POST | `{email}` | `{ok:true}`(該当ユーザーが存在してもしなくても同じレスポンスを返し、メール登録の有無を外部に漏らさない) |
| `password_reset_confirm.php` | POST | `{token, new_password}` | `{ok:true}` または `{ok:false, error:"invalid_or_expired_token"}` |

#### ダッシュボードAPI(`workout.<domain>/api/`、全エンドポイントでログイン必須)
| endpoint | method | payload | response |
| :--- | :--- | :--- | :--- |
| `get_board.php` | GET | - | 種目一覧(現在値・目標値込み) |
| `get_cycles.php` | GET | - | 自分のサイクル一覧(`get_board`は種目が1件も無いサイクルを返さないため、サイクル管理・種目追加フォーム用に別途用意) |
| `get_logs.php` | GET | `exercise_id?`, `date_from?`, `date_to?`(省略時は全件) | グラフ用の記録ログ |
| `get_recent_logs.php` | GET | `limit?`(既定20) | `{logs: [{id, exercise_id, exercise_name, cycle_id, logged_date, set_number, weight, reps}]}` |
| `add_log.php` | POST | `{exercise_id, logged_date, sets:[{weight,reps},...]}` | `{ids:[...]}` |
| `edit_log.php` | POST | `{id, logged_date, weight, reps}` | `{ok:true}` |
| `delete_log.php` | POST | `{id}` | `{ok:true}` |
| `add_cycle.php` | POST | `{label}` | `{id}` |
| `edit_cycle.php` | POST | `{id, label}` | `{ok:true}` |
| `delete_cycle.php` | POST | `{id}` | `{ok:true}` または `{ok:false, error:"has_exercises"}` |
| `add_exercise.php` | POST | `{cycle_id, name, target_weight?, target_reps?, target_sets?}` | `{id}` |
| `edit_exercise.php` | POST | `{id, target_weight?, target_reps?, target_sets?, discontinued?}` | `{ok:true}` |
| `delete_exercise.php` | POST | `{id}` | `{ok:true}` または `{ok:false, error:"has_logs"}` |
| `get_body_weight_logs.php` | GET | `date_from?`, `date_to?` | 体重の記録一覧 |
| `add_body_weight_log.php` | POST | `{logged_date, weight}` | `{ok:true}`(同日の既存記録があれば上書き) |
| `delete_body_weight_log.php` | POST | `{id}` | `{ok:true}` |
| `get_me.php` | GET | - | `{display_name, email, birth_date, gender}` |
| `update_me.php` | POST | `{display_name?, birth_date?, gender?}` | `{ok:true}` |
| `export.php` | GET | - | CSV形式のダウンロード(記録・体重記録) |
| `delete_account.php` | POST | `{}` | `{ok:true}`(成功時セッション破棄、以後そのアカウントの全データは失われる) |

## 3. 画面構成

ダッシュボードは**1つのSPA**とし、ログイン状態に応じて画面を出し分ける(ページ遷移の少ないシングルページ構成)。

```
未ログイン時:
[トップページ]
  - サービス説明・ログイン導線
  - [Googleでログイン] ボタン
  - メールアドレス+パスワードでのログイン/新規登録フォーム
  - 「パスワードを忘れた方」リンク

初回ログイン(サイクルが1件も無いユーザー)時:
[オンボーディング画面]
  - サイクルテンプレートの選択(§2.7)、または「ゼロから作る」を選んで手動でサイクル名を入力
  - 完了すると通常のダッシュボードへ

ログイン後(通常時):
[ヘッダー: ようこそ、{display_name}さん] [ログアウト]
[タブ: 管理表 | グラフ | 体重 | 設定]

--- 管理表タブ ---
自分のサイクルごとに区切って一覧表示
各行: 種目名・現在重量・現在回数・現在セット・目標重量・目標回数・目標セット(現在側はドロップセット等で複数行になり得る、rowspanで表示)
単位はヘッダー側にのみ表記(重量列ヘッダーを「重量(kg)」とする)。重量は小数点1桁で統一表示する(例: 60.0)
種目が0件のサイクルはそのサイクル名の見出しのみ表示する(旧設計の「休憩の特別扱い」は廃止、§2.3参照)
廃止済み(`is_discontinued=1`)の種目はこの一覧には表示しない

--- グラフタブ ---
[種目選択ドロップダウン] [期間切り替え: 直近30日 / 直近3ヶ月 / 全期間]
グラフ1: 重量推移(折れ線、その日の最大重量)
グラフ2: 総作業量推移(折れ線、重量×回数の合計)

--- 体重タブ(US-15) ---
[日付・体重の入力欄]
[期間切り替え: 直近30日 / 直近3ヶ月 / 全期間]
グラフ: 体重推移(折れ線)

--- 設定タブ ---
プロフィール編集: 表示名・生年月日・性別(US-14)
サイクル管理: 追加・名称変更・削除(US-13)
記録のエクスポート: CSVダウンロードボタン(US-17)
アカウント削除: 確認ダイアログ付きの退会ボタン(US-16)
```

種目選択ドロップダウンは、管理表と同じくサイクルごとに`<optgroup>`でグループ化する。廃止済み種目も元のサイクルのグループ内に含め、種目名の末尾に`(廃止)`と付けて区別する(過去の推移は引き続きグラフで参照できる)。

**実装上の注意(パフォーマンス)**: ダッシュボード表示時に`get_board`・`get_logs`(全件)を並列で1回だけ取得し、管理表タブ・グラフタブの両方で使い回す。グラフタブの種目選択・期間切り替えはAPIを呼び直さず、取得済みの全記録ログをブラウザ側でフィルタするだけで完結させる。

### 3.1 入力フォームの項目詳細
- 日付: 今日の日付を自動入力(手動で変更可)
- セット欄の初期値: 種目を選択すると、その種目の`current`(直近の記録日のセット構成)をそのままセット欄の初期値として展開する(前回と同じ内容なら書き換えずそのまま送信できる)。現在値が無い種目は空欄3セット分を初期値にする
- 種目: 種目一覧からドロップダウンで選択(サイクルごとに`<optgroup>`でグループ化、選択時は`exercise_id`を送信)
- セット: デフォルトで3セット分の入力欄(重量・回数)を表示し、「セットを追加」ボタンで動的に増やせる。1〜2セットだけの入力でも送信できる方法は2通り: 「セットを削除」ボタンで行自体を減らす、または使わない行の重量・回数を両方空欄のまま送信する(重量・回数が両方空欄の行は未使用として無視される。片方だけ空欄の場合は入力不足のエラーになる)
- 各セット行には「コピー」ボタンを設置し、直前のセット行の重量・回数をそのままコピーできる。1セット目には表示されない

### 3.2 目標値の編集・種目の追加/削除(US-7対応)
設定タブとは別に、管理表タブに「管理表の編集」セクションを設ける。
- **目標値の編集**: 既存種目を一覧表示し、目標重量・目標回数・目標セットをその場で書き換えて保存できる(種目名・サイクルは変更不可、現在値はこの画面では編集不可)。対象行は`exercise_id`で特定する
- **廃止フラグの切り替え**: 各行に「廃止」チェックボックスを設け、目標値と同時に保存できる。ONにすると`cycle_id`はそのまま(元のサイクルに属したまま)で`is_discontinued`だけが立ち、記録フォーム・この一覧の入力対象からは除外される。グラフでは引き続き元のサイクルのグループ内から選択できる
- **種目の追加**: サイクル・種目名・目標重量・目標回数・目標セットを入力して新しい種目を追加できる(`is_discontinued`は常に0で開始)。現在値は記録が無いため空配列になる
- **種目の削除**: 一覧から種目を選んで削除できる。記録が1件でも紐づく種目は削除できない(DBの外部キー制約でも保護される)。使わなくなった種目は物理削除せず「廃止」フラグをONにする運用とする

### 3.3 記録の入力・修正・削除(US-5対応)
「記録を送信」「削除」「まとめて編集の保存」は、いずれもAPI応答を待ってから画面に結果を反映する、通常の同期的なフローとする(MySQL+PHPへの移行後は1回の呼び出しが数十ms程度で済むため、楽観的更新のような複雑さは導入しない)。

- 記録追加: 送信ボタンを押すと送信中表示になり、`add_log`の応答が返ってから「直近の記録」欄とフォームを更新する
- 記録削除: 「削除」ボタンを押すと即座に`delete_log`を送信し、応答後に一覧から取り除く(確認ダイアログは表示しない)
- 一覧全体に対して1つだけ「まとめて編集」ボタンを設置する。押すと表示中の全行が同時に入力モード(日付・重量・回数を書き換え可能)に切り替わり、ボタンは「保存」に変わる。再度押すと、編集モードに入った時点の値と比較して実際に変更のあった行だけを送信対象にする(並列送信)。全件の応答が揃ってから一覧を更新する

## 4. 非機能要件
- 費用: 追加費用なし(既存のXServer契約・Google Cloud無料枠の範囲内)
- 対応端末: スマートフォン・PCの両方でレイアウトが崩れないこと(レスポンシブ対応)
- 複数端末からのデータ同期: MySQLを単一の真実源とすることで実現
- 検索エンジン: ログイン前のトップページはむしろインデックスさせたい(noindexは設定しない)。ログイン後のダッシュボードは認証必須のため、そもそもクロールされない
- データ分離: §1.2・§1.3の方針により、他のユーザーのデータへのアクセス・削除時の連鎖を確実に防ぐ

## 5. セットアップ手順(XServer)

1. サブドメイン`workout.tamachan-blog.com`は初回のGoogle Sheets→XServer移行時に作成済み(SSLも発行済み)。新規作成は不要。今回はこの既存サブドメインの上に新システムをデプロイし、稼働中の旧(自分専用)版を置き換える
2. 移行作業を始める前に、`sql/backup_before_migration.sql`をphpMyAdminのSQLタブで実行し、旧`cycles`・`exercises`・`logs`のデータをDB内にスナップショット(`backup_*`テーブル)として残す。念のため、phpMyAdminの「エクスポート」機能によるファイルダウンロードも別途行っておく
3. MySQLデータベースも既存のものをそのまま使う(新規作成しない)。ただし旧スキーマ(`cycles`・`exercises`・`logs`、いずれも`user_id`列なし)がそのまま残っているため、phpMyAdminで次を実行し、旧テーブルを退避する(InnoDBの`RENAME TABLE`は外部キー制約もそのまま追従する):
   ```sql
   RENAME TABLE cycles TO old_cycles, exercises TO old_exercises, logs TO old_logs;
   ```
4. phpMyAdminから`sql/schema.sql`を実行し、`users`・`password_reset_tokens`・`cycles`・`exercises`・`logs`・`body_weight_logs`テーブルを作成する(手順3でリネーム済みのため名前は衝突しない)
5. XServerのメール機能でパスワードリセット送信用のメールアカウント(例: `noreply@workout.<domain>`)を作成し、SPF/DKIMを設定する
6. Google Cloud ConsoleでOAuth 2.0クライアントID(ウェブアプリケーション種別)を作成し、リダイレクトURIに`https://workout.<domain>/api/auth/google_callback.php`を登録する。クライアントID・シークレットは`php/private/.env`に設定する
7. API(PHP)を`workout.<domain>/api/`にFTPでアップロードする。`php/private/.env.example`を`.env`としてコピーし、DB接続情報・Google OAuthクライアント情報・メール送信設定を入力する
8. ダッシュボードアプリをビルドし、`dist/`配下一式(`index.html`・`assets/`・`sw.js`・`manifest.webmanifest`・`.htaccess`等)を`workout.<domain>/`直下にFTPでアップロードする。`.htaccess`は`sw.js`等の名前が変わらないファイルにキャッシュさせないための設定で、これが欠けるとデプロイのたびにブラウザ・中間キャッシュが古いService Workerを配信し続ける不具合が起きる(実際に本番で発生。隠しファイルなのでFTPクライアント側で表示設定を確認すること)
9. 開発者自身のアカウントをサインアップする(Googleまたはメール/パスワード)。オンボーディング画面が出た状態のまま先に進まない(サイクルを作成すると、次の移行手順のUNIQUE制約に抵触するため)
10. `sql/migrate_to_multiuser.sql`のコメントに従って`user_id`を書き換えたうえでphpMyAdminで実行し、手順3で退避した旧データ(サイクル・種目・記録)を自分のアカウントに移行する。件数確認後、問題なければ`old_cycles`・`old_exercises`・`old_logs`(と、手順2の`backup_*`テーブル)を削除する
11. サインアップ・ログイン(Google/メール両方)・パスワードリセット・記録の追加/修正/削除・目標編集・種目/サイクルの追加・削除・体重記録・プロフィール編集・CSVエクスポート・アカウント削除が一通り動作することを確認する
12. 新システムの表示を旧システムの記録と突き合わせて問題なければ、さらに前のGoogle Apps Script・スプレッドシートは読み取り専用のフォールバックとしてしばらく残し、確認期間後に廃止する
