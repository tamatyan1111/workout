---
type: Design Doc
title: 設計
description: からだ手帳サイトのアーキテクチャ・データモデル・画面構成
tags: [からだ手帳, design]
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

- ダッシュボードアプリ(静的HTML)は、ログイン画面・サインアップ画面・オンボーディング・運動タブ・食事タブ・プロフィールタブを1つのSPAとして提供し、`workout.tamachan-blog.com/`直下にビルド済み成果物をFTPS経由のCI/CDで配置する
- APIはすべて`workout.<domain>/api/`に集約する。全エンドポイントがログイン必須で、旧来の「公開読み取りAPI」と「秘密パスAPI」の区別は廃止する(唯一の例外は`get_shared_recipe.php`。§2.19参照。ログインではなく推測困難なトークンでゲートする、パスワードリセットリンクと同じ設計)
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

`cycles`・`exercises`・`logs`・`body_weight_logs`(および2026-08追加の`nutrition_goals`・`custom_foods`・`recipes`・`recipe_items`・`meals`・`meal_items`)の**全テーブルに`user_id`を直接持たせる**(`cycles`経由の間接参照だけに頼らない)。各APIエンドポイントは必ずログイン中の`user_id`でWHERE句を絞り込み、リクエストパラメータで送られてきた`user_id`は一切信用しない。全ユーザー共通マスタの`foods`のみ`user_id`を持たない(§2.12)。

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
  height_cm      SMALLINT UNSIGNED NULL,     -- BMI・TDEE計算用(2026-08、食事機能対応で追加予定)
  activity_level ENUM('sedentary', 'light', 'moderate', 'active') NULL,  -- TDEE計算の活動係数(同上)
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
- `height_cm`・`activity_level`は2026-08の食事記録機能検討([requirements.md](requirements.md) §7)に伴う追加列。`birth_date`・`gender`と同様に任意項目とし、未入力でも他機能(管理表・グラフ・体重記録)には影響しない。TDEE計算(§2.17)に使うが、未入力の場合はTDEE・目標カロリーの自動算出ができない旨をダッシュボードに表示する。`activity_level`の係数(Harris-Benedict/Mifflin-St Jeorで一般的なPAL値)は次の通り: `sedentary`=デスクワーク中心・ほぼ運動しない(×1.2)、`light`=軽い運動習慣・週1〜3日(×1.375)、`moderate`=立ち仕事や中程度の運動・週3〜5日(×1.55)、`active`=激しい運動習慣・週6〜7日(×1.725)
- 本番DBには既に`users`テーブルが存在するため、実装時はこの2列を追加する`ALTER TABLE`スクリプトが必要(`sql/migrate_to_multiuser.sql`と同様の追加マイグレーションとして、実装時に作成する)

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
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id              INT UNSIGNED NOT NULL,
  logged_date          DATE NOT NULL,
  weight               DECIMAL(5,2) NOT NULL,
  body_fat_percentage  DECIMAL(4,1) NULL,       -- 任意項目。未入力可(2026-08-15、UI再設計フェーズ2)
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_body_weight_logs_user_id_logged_date (user_id, logged_date),
  KEY idx_body_weight_logs_user_id_logged_date (user_id, logged_date),
  CONSTRAINT fk_body_weight_logs_user_id FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

1日1件の記録を前提とし、`(user_id, logged_date)`をユニーク制約にする。同じ日に再送信した場合は`add_body_weight`側で既存行をUPSERT(上書き)する(トレーニング記録のような1日複数セットの概念が体重にはないため、種目記録とは異なり単純な時系列として扱う)。

`body_fat_percentage`は体重と同時に任意入力できる項目で、未入力の記録と混在してよい(体重の推移とは別に、入力がある日だけグラフに表示する)。

過去の記録の日付・体重を直接編集する`edit_body_weight_log.php`(2026-08-15追加、`edit_log.php`と同じ全項目送信方式)も用意する。編集後の日付が既存の別記録と重複する場合は、ユニーク制約違反として`{ok:false, error:"duplicate_date"}`を返す(生のSQLエラーをそのまま返さず、意味のあるエラーコードに変換する)。

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
| `edit_body_weight_log.php` | POST | `{id, logged_date, weight}` | `{ok:true}` または `{ok:false, error:"duplicate_date"}` |
| `delete_body_weight_log.php` | POST | `{id}` | `{ok:true}` |
| `get_me.php` | GET | - | `{display_name, email, birth_date, gender, height_cm, activity_level}` |
| `update_me.php` | POST | `{display_name?, birth_date?, gender?, height_cm?, activity_level?}` | `{ok:true}` |
| `export.php` | GET | - | CSV形式のダウンロード(記録・体重記録) |
| `delete_account.php` | POST | `{}` | `{ok:true}`(成功時セッション破棄、以後そのアカウントの全データは失われる) |

#### 食事API(`workout.<domain>/api/`、全エンドポイントでログイン必須。§2.11〜2.17対応、新規)
| endpoint | method | payload | response |
| :--- | :--- | :--- | :--- |
| `get_nutrition_summary.php` | GET | - | BMI・TDEE・目標カロリー・目標PFCグラム数・達成日超過バナー・進捗マイルストーン(§2.16・2.17の計算結果一式) |
| `get_nutrition_goal.php` | GET | - | 最新の`nutrition_goals`1件(`null`の場合は未設定) |
| `add_nutrition_goal.php` | POST | `{target_weight, target_date, pfc_mode, custom_protein_g?, custom_fat_g?, custom_carb_g?}` | `{id}`(新規行を`INSERT`。`start_weight`はサーバー側で直近体重から自動設定) |
| `search_foods.php` | GET | `q?`, `food_group_code?`, `kcal_min?`, `kcal_max?` | `foods`・`custom_foods`を横断した検索結果一覧 |
| `get_custom_foods.php` | GET | - | 自分の独自食材一覧(`search_foods.php`と異なり共通マスタを含まない、管理画面用) |
| `add_custom_food.php` | POST | `{name, kcal_per_100g, protein_g_per_100g, fat_g_per_100g, carb_g_per_100g}` | `{id}` |
| `edit_custom_food.php` | POST | `{id, name, kcal_per_100g, protein_g_per_100g, fat_g_per_100g, carb_g_per_100g}`(`edit_exercise.php`等と同じく部分更新ではなく全項目を送る) | `{ok:true}` |
| `delete_custom_food.php` | POST | `{id}` | `{ok:true}` または `{ok:false, error:"has_recipes"}` |
| `get_recipes.php` | GET | - | 自分のレシピ一覧(構成食材込み、`is_shared`フラグ込み) |
| `add_recipe.php` | POST | `{name, items:[{master_food_id\|custom_food_id, quantity_g},...]}` | `{id}` |
| `edit_recipe.php` | POST | `{id, name, items:[...]}`(itemsは丸ごと置き換え) | `{ok:true}` |
| `delete_recipe.php` | POST | `{id}` | `{ok:true}` |
| `share_recipe.php` | POST | `{id}` | `{share_url}`(§2.19。共有のたびにトークンを再発行) |
| `unshare_recipe.php` | POST | `{id}` | `{ok:true}` |
| `get_shared_recipe.php` | GET(**ログイン不要**) | `token`(クエリ) | `{name, items}`(§2.19、無効なトークンは404) |
| `get_meals.php` | GET | `date_from?`, `date_to?` | 食事ログ一覧(`meal_items`込み、`recipe_batch_id`でグループ化可能な形) |
| `add_meal.php` | POST | `{logged_date, meal_type, items:[{master_food_id\|custom_food_id, quantity_g},...]}` または `{logged_date, meal_type, recipe_id}` | `{id, item_ids:[...]}`(レシピ指定時はサーバー側で`recipe_items`を展開し`meal_items`をスナップショット保存) |
| `add_meal_item.php` | POST | `{meal_id, master_food_id\|custom_food_id, quantity_g}` \| `{meal_id, recipe_id}` | `{ids:[...]}`(既存の食事ログへの追加。カートへの追加操作に対応) |
| `edit_meal_item.php` | POST | `{id, master_food_id\|custom_food_id, quantity_g}` | `{ok:true}`(食材・分量を直し、`*_snapshot`列を再解決してUPDATE。`meal_id`・`recipe_batch_id`は変更不可) |
| `delete_meal_item.php` | POST | `{id}` | `{ok:true}`(単品削除) |
| `delete_meal_item_group.php` | POST | `{recipe_batch_id}` | `{ok:true}`(同じ`recipe_batch_id`を持つ行をまとめて削除) |
| `delete_meal.php` | POST | `{id}` | `{ok:true}`(食事ログ全体を削除、`meal_items`も`CASCADE`で削除。写真があればファイルも削除) |
| `upload_meal_photo.php` | POST(multipart/form-data) | `meal_id`, `photo`(ファイル) | `{ok:true}`(§2.18参照。既存の写真があれば差し替え) |
| `delete_meal_photo.php` | POST | `{meal_id}` | `{ok:true}` |
| `get_meal_photo.php` | GET | `meal_id`(クエリ) | 画像バイナリ(`Content-Type: image/jpeg`)。所有権を検証してから返す |

### 2.11 `nutrition_goals` テーブル — 体重目標・カロリー目標・PFC配分方式(新規、§7対応)

```sql
CREATE TABLE nutrition_goals (
  id                          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id                     INT UNSIGNED NOT NULL,
  start_weight                DECIMAL(5,2) NOT NULL,   -- 設定時点の直近体重のスナップショット(進捗率計算の起点)
  target_weight               DECIMAL(5,2) NOT NULL,
  target_body_fat_percentage  DECIMAL(4,1) NULL,       -- 任意項目。未入力可(2026-08-15、UI再設計フェーズ2)
  target_date                 DATE NOT NULL,
  pfc_mode                    ENUM('standard', 'bulk', 'cut', 'custom') NOT NULL DEFAULT 'standard',
  custom_protein_g            DECIMAL(6,1) NULL,       -- pfc_mode='custom' のときのみ使用
  custom_fat_g                DECIMAL(6,1) NULL,
  custom_carb_g               DECIMAL(6,1) NULL,
  created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_nutrition_goals_user_id_created_at (user_id, created_at),
  CONSTRAINT fk_nutrition_goals_user_id FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

`target_body_fat_percentage`は目標体重と同時に任意入力できる項目で、`body_fat_percentage`同様グラム数計算(PFC等)には使わず表示専用。

- 「目標を設定する」操作は常に新しい行を`INSERT`する(体重記録の`current`と同じ考え方で、そのユーザーの**最新の1行**が「現在の目標」になる。`is_active`のようなフラグ列は持たない)。目標を見直す・達成日を過ぎて再設定する場合も、新しい行を追加するだけでよく、履歴としてそのまま残る
- `start_weight`は、目標を新規作成する瞬間の`body_weight_logs`の最新値をコピーして保存する(進捗率マイルストーンの計算で「どこから始めたか」の基準点が必要なため。後から`body_weight_logs`側が編集されても目標の起点がぶれないよう、あえてスナップショットにする)
- `pfc_mode`が`standard`/`bulk`/`cut`のとき、具体的な配分(P15%/F25%/C60%、体重×1.8g/kg、体重×2.0g/kg等)はアプリ側の固定定数として扱い、DBには持たせない([requirements.md](requirements.md) §7参照)。`custom`のときのみ、ユーザーが直接入力したグラム数を`custom_protein_g`等に保存する

### 2.12 `foods` テーブル — 食品標準成分表マスタ(新規、全ユーザー共通)

```sql
CREATE TABLE foods (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  food_number           VARCHAR(10) NOT NULL,    -- 食品標準成分表の食品番号(5桁)
  food_group_code       CHAR(2) NOT NULL,        -- 食品群番号
  food_group_name       VARCHAR(50) NOT NULL,    -- 食品群名(例: 穀類、野菜類)。非正規化だが全18群固定で変動しないため許容
  name                  VARCHAR(255) NOT NULL,
  kcal_per_100g         DECIMAL(6,1) NOT NULL,
  protein_g_per_100g    DECIMAL(6,2) NULL,     -- 「-」(未測定)の食品が実データに数件あるためNULL許容
  fat_g_per_100g        DECIMAL(6,2) NULL,
  carb_g_per_100g       DECIMAL(6,2) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_foods_food_number (food_number),
  KEY idx_foods_food_group_code (food_group_code),
  FULLTEXT KEY ftx_foods_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- 文部科学省「日本食品標準成分表(八訂)増補2023年」の「第2章(データ)」Excel(`表全体`シート)からバッチ取り込みで作成する。取り込みスクリプトは`sql/import/generate_foods_sql.js`(Node.js、リポジトリに保存。次回以降の改訂版データにも再利用する)。ユーザーからのAPI経由での追加・編集・削除は行わない(読み取り専用マスタ)
- 実データには微量を示す「Tr」(trace)表記と、未測定を示す「-」表記が数十件ある。取り込みスクリプトは「Tr」を`0`、「-」を`NULL`として変換する(カッコ書きの数値、例:「(11.3)」は「他の成分から計算した値」を示す確定値なのでカッコを外してそのまま数値として扱う)
- 食品名検索は`FULLTEXT`インデックスを使う(日本語の分かち書きが必要なため、MySQL/MariaDBの`ngram`パーサーを`ft_min_word_len`等と合わせて設定する。詳細は実装時に検証する)
- 出典表記([requirements.md](requirements.md) §7の利用条件)は、この`foods`データを使う検索画面・食品詳細に必ず添える

### 2.13 `custom_foods` テーブル — ユーザー独自食材(新規)

```sql
CREATE TABLE custom_foods (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id               INT UNSIGNED NOT NULL,
  name                  VARCHAR(255) NOT NULL,
  kcal_per_100g         DECIMAL(6,1) NOT NULL,
  protein_g_per_100g    DECIMAL(6,2) NOT NULL,
  fat_g_per_100g        DECIMAL(6,2) NOT NULL,
  carb_g_per_100g       DECIMAL(6,2) NOT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_custom_foods_user_id FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- `foods`と項目構成を揃え、食品検索・食事ログ入力の双方から同じ形で扱えるようにする(§7「独自食品追加は食材単位のみ」の通り、`food_group_code`は持たせない)

### 2.14 `recipes` / `recipe_items` テーブル — レシピ(料理)テンプレート(新規)

```sql
CREATE TABLE recipes (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           INT UNSIGNED NOT NULL,
  name              VARCHAR(255) NOT NULL,
  share_token_hash  CHAR(64) NULL,   -- 共有リンク用トークンのSHA-256。NULL=非公開(§2.19、2026-08-15追加)
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_recipes_share_token_hash (share_token_hash),
  CONSTRAINT fk_recipes_user_id FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recipe_items (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipe_id       INT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NOT NULL,
  master_food_id  INT UNSIGNED NULL,
  custom_food_id  INT UNSIGNED NULL,
  quantity_g      DECIMAL(7,1) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_recipe_items_recipe_id FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  CONSTRAINT fk_recipe_items_user_id FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_recipe_items_master_food_id FOREIGN KEY (master_food_id) REFERENCES foods(id),
  CONSTRAINT fk_recipe_items_custom_food_id FOREIGN KEY (custom_food_id) REFERENCES custom_foods(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- `recipe_items`は`master_food_id`・`custom_food_id`のどちらか一方だけを設定する。ポリモーフィックな1列参照ではなく2列のFKに分けることで、DBレベルの参照整合性(参照先が実在すること)は維持している。ただし「どちらか一方のみ」という排他性そのものはDBの`CHECK`制約では表現していない(MariaDBは外部キー制約が張られた列をCHECK制約内で参照できないため、`ERROR 1901`になり実装時に判明した)。この排他チェックは`parse_recipe_items()`(`php/private/queries.php`)で行う
- `recipe_items`はテンプレートなので、食材の栄養値は**スナップショットせず**常に`foods`/`custom_foods`を都度JOINして最新値を参照する(レシピ編集はテンプレートの更新であり、過去ログとは無関係なため。過去ログ側の不変性は§2.15の`meal_items`側で担保する)
- レシピは`user_id`に閉じたテンプレートだが、リンクによる限定共有(閲覧のみ)には対応する。詳細は§2.19。`recipe_items`は`recipes`削除時に`CASCADE`で削除される(レシピの構成要素はレシピと運命を共にする子データのため、§1.3のアカウント削除順序の懸念とは別枠)

### 2.15 `meals` / `meal_items` テーブル — 食事ログ(新規)

```sql
CREATE TABLE meals (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  logged_date  DATE NOT NULL,
  meal_type    ENUM('breakfast', 'lunch', 'dinner', 'snack') NOT NULL,
  photo_path   VARCHAR(255) NULL,   -- 添付メモ写真(自動計算には使わない)
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_meals_user_id_logged_date (user_id, logged_date),
  CONSTRAINT fk_meals_user_id FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE meal_items (
  id                          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  meal_id                     INT UNSIGNED NOT NULL,
  user_id                     INT UNSIGNED NOT NULL,
  master_food_id              INT UNSIGNED NULL,
  custom_food_id              INT UNSIGNED NULL,
  eating_out_meal_id          INT UNSIGNED NULL,   -- §2.20参照(2026-08-18追加)
  food_name_snapshot          VARCHAR(255) NOT NULL,
  kcal_per_100g_snapshot      DECIMAL(6,1) NOT NULL,
  protein_g_per_100g_snapshot DECIMAL(6,2) NOT NULL,
  fat_g_per_100g_snapshot     DECIMAL(6,2) NOT NULL,
  carb_g_per_100g_snapshot    DECIMAL(6,2) NOT NULL,
  quantity_g                  DECIMAL(7,1) NOT NULL,
  recipe_batch_id             CHAR(36) NULL,       -- 同じレシピ展開でまとめて追加された行の目印(UUID)
  recipe_name_snapshot        VARCHAR(255) NULL,
  created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_meal_items_meal_id (meal_id),
  KEY idx_meal_items_recipe_batch_id (recipe_batch_id),
  CONSTRAINT fk_meal_items_meal_id FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE,
  CONSTRAINT fk_meal_items_user_id FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_meal_items_master_food_id FOREIGN KEY (master_food_id) REFERENCES foods(id) ON DELETE SET NULL,
  CONSTRAINT fk_meal_items_custom_food_id FOREIGN KEY (custom_food_id) REFERENCES custom_foods(id) ON DELETE SET NULL,
  CONSTRAINT fk_meal_items_eating_out_meal_id FOREIGN KEY (eating_out_meal_id) REFERENCES eating_out_meals(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- `meal_items`も`recipe_items`と同じ理由(MariaDBの制限、上記参照)で、`master_food_id`・`custom_food_id`・`eating_out_meal_id`の排他性はCHECK制約では表現せず、`resolve_items_for_meal()`(`php/private/queries.php`)で担保する
- `meal_items`は`recipe_items`と違い、追加した**瞬間の栄養値をスナップショットする**(`*_snapshot`列)。理由は§2.14と対称: ログは「その時食べたものの記録」という不変の事実であるべきで、後から`foods`のマスタ改訂や`custom_foods`の編集があっても、過去のログの計算結果が遡って変わってはならない(§2.9で確立した「記録は記録として固定する」方針と同じ考え方)
- `master_food_id`・`custom_food_id`は表示・再検索の手がかりとして残すのみで、栄養計算には使わない(計算は常に`*_snapshot`列を使う)。そのため参照先が削除されても`SET NULL`で構わない(`exercises`/`logs`のような`RESTRICT`は不要)
- レシピをカートに追加した瞬間、`recipe_items`をJOINして展開し、`meal_items`に食材ごとの行としてスナップショット付きで`INSERT`する。同じ操作で追加された行には共通の`recipe_batch_id`(UUID)を振り、`recipe_name_snapshot`にレシピ名を記録する。これにより、カート画面・保存後の編集画面の両方で「同じ`recipe_batch_id`を持つ行をまとめて1回の操作で削除する」UIが実現できる(個別行だけを`recipe_batch_id`を残したまま削除することも可能)
- 直接食材を追加した行は`recipe_batch_id`・`recipe_name_snapshot`とも`NULL`のままになる
- `meals`→`meal_items`は`ON DELETE CASCADE`とする(`meal_items`は`meals`に完全に従属する明細行であり、§1.3のアカウント削除順序の懸念とは別の、単純な親子関係のため)
- `photo_path`はファイルシステム上の相対パス(例: `uploads/meal_photos/{user_id}/{uuid}.jpg`)を保存する。実ファイルは`php/private/uploads/meal_photos/`配下(Webから直接アクセス不可)に置き、`meals`1件につき1枚まで(2026-08-15、写真アップロード機能を実装。詳細は§2.18)
- `meal_items`は追加後の編集(`edit_meal_item.php`、2026-08-15追加)にも対応する。「とりあえず仮の分量で記録し、後で正確な値に直したい」という利用シーンのため。`resolve_items_for_meal()`と同じ食品解決ロジックを1件分だけ呼び出し、`*_snapshot`列・`quantity_g`をUPDATEで上書きする(INSERTではなくUPDATE対象に使うだけで、ロジック自体は共通化できる)。`meal_id`・`recipe_batch_id`は変更不可(食材の中身と分量だけを直す操作とし、どの食事・どのレシピ由来かという所属は動かさない)

### 2.18 食事写真のアップロード・配信(新規、2026-08-15)

- **保存**: `upload_meal_photo.php`が`multipart/form-data`で受け取り、`finfo`で実際のMIMEタイプを検証(拡張子だけの判定はしない)。対応形式はJPEG・PNG・WebPのみ。GDライブラリで長辺1600pxを超える場合はリサイズし、JPEG品質80%で再エンコードして保存する(アップロード自体は8MBまで許可、保存後は多くの場合数百KB程度に収まる)
- ファイル名はUUIDで生成し、ユーザー入力の元ファイル名はそのまま使わない(パストラバーサル・上書き事故を防ぐため)。既に写真がある`meals`に再アップロードした場合、DB更新後に旧ファイルを削除する
- **配信**: `get_meal_photo.php`は`meal_id`を受け取り、`find_meal()`と同様にログイン中の`user_id`で所有権を検証してから画像バイナリを返す。`php/private/`配下の実ファイルへの直リンクは公開しない(他のデータと同じく`user_id`絞り込みを徹底する方針に合わせる、推測困難なファイル名だけに頼った公開配信は採用しない)
- **削除**: `delete_meal_photo.php`(`meal_id`のみ)は`photo_path`を`NULL`に更新しファイルを削除する。`delete_meal.php`(食事ログ全体の削除)でも、紐づく写真があれば同様にファイルを削除してから行を削除する

### 2.19 レシピの共有リンク機能(新規、2026-08-15)

- **トークン方式**: `password_reset_tokens`と同じ方針で、生トークン(`generate_random_token()`、32バイトのランダム値)はDBに残さず、SHA-256ハッシュ(`hash_token()`)のみ`recipes.share_token_hash`に保存する。`NULL`=非公開、非`NULL`=共有中、という1列でトグルを表現する(共有可否だけのための別列は持たない)
- **発行・停止**: `share_recipe.php`(POST、ログイン必須、所有権チェック)は共有を有効化し、`app_base_url`から組み立てた共有URL(`/?share_recipe=<生トークン>`)を返す。**共有のたびに新しいトークンで上書きする**(既存トークンを「返す」という選択肢は、生トークンをDBに残さない設計上そもそも存在しない)。この結果、「もう一度発行する」操作が暗黙のリンク再発行(旧リンクの無効化)になる。`unshare_recipe.php`(POST)は`share_token_hash`を`NULL`に戻す
- **閲覧**: `get_shared_recipe.php`(GET、**意図的にログイン不要**、§1.1参照)は`token`パラメータのハッシュで`recipes`を検索し、見つかったレシピのオーナーの`user_id`を使って`expand_recipe_items()`(§2.14と同じ、常にライブ解決)を呼び出し、レシピ名・構成食材・現在の栄養値を返す。閲覧側はセッションを持たないため、オーナーの`user_id`は常にトークンの検索結果から得る(リクエストパラメータのuser_idは信用しない、という§1.2の方針と矛盾しない)
- **フロント**: 専用のパス(`/shared-recipe`等)ではなく、パスワードリセットと同じくルート直下のクエリパラメータ方式(`/?share_recipe=...`)にする(§1.1・§3参照、ルートは常に実ファイルの`index.html`でありService Workerのフォールバック設定変更が不要なため)。`apps/dashboard/src/sharedRecipe.ts`がログイン画面と同じ`.auth-screen`の体裁で、ダッシュボードのUIに一切依存せずレンダリングする
- **スコープ外**(変更なし、[requirements.md](requirements.md) §7参照): 共有レシピの公開ディレクトリでの検索・閲覧、共有された側が「自分のレシピとしてコピーする」機能。今回はリンクを知っている相手への閲覧のみ

### 2.20 `eating_out_meals` テーブル — 外食(材料不明の食事)の記録(新規、2026-08-18)

```sql
CREATE TABLE eating_out_meals (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  name        VARCHAR(255) NOT NULL,
  kcal        DECIMAL(6,1) NOT NULL,
  protein_g   DECIMAL(6,2) NOT NULL,
  fat_g       DECIMAL(6,2) NOT NULL,
  carb_g      DECIMAL(6,2) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_eating_out_meals_user_id FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- **背景**: 食事の記録手段は「食材」(単品)と「レシピ」(食材の組み合わせ、自炊)の2つがあったが、いずれも材料が分かっていることが前提だった。外食・コンビニ惣菜のように材料は分からないが名前と総量の栄養値だけ分かる食事を記録する第3の手段として追加する
- `custom_foods`と違い「100gあたり」ではなく**1食分の実値をそのまま**持つ。レシピと同じく「1人前固定で登録し、1人前食べるように調整する」という運用のため、量のスケーリングは持たない(design.mdの他のテーブルと違い`_per_100g`という列名にしていないのはこのため)
- レシピの構成食材(`recipe_items`)としては使えない(材料不明という前提と矛盾するため)。`recipes.ts`側の食品検索には出てこない
- `meal_items.eating_out_meal_id`で参照する。`resolve_food_source()`(`php/private/queries.php`)がこのテーブルの`kcal`等をそのまま「100gあたり」のスナップショット値として返し、呼び出し側は`quantity_g`に常に固定値100を渡すことで、`per_100g × quantity_g / 100`という既存の計算式をそのまま使い回す(専用の計算パスを作らない)。UI上は常に「1食分」とだけ表示し、`quantity_g`という内部表現はユーザーに見せない
- `custom_foods`と違い、削除時の使用中チェックは行わない(`meal_items.eating_out_meal_id`は`ON DELETE SET NULL`のため、削除しても過去の記録は`*_snapshot`列で自己完結しており壊れない)
- 直近の履歴(`recentMeals.ts`)の編集モードでは、量の編集・食材の差し替えUIは出さず、削除のみ許可する(レシピと同じ「1人前固定」という考え方のため)

### 2.16 BMI・TDEE・目標カロリー・PFCグラム数の算出ロジック(読み取り時に計算、§7対応)

§2.9と同じ方針で、これらの数値はどこにもキャッシュせず、表示のたびに`users`(身長・活動レベル・生年月日・性別)・`body_weight_logs`(直近の体重)・`nutrition_goals`(最新の目標)から都度計算する。

1. **年齢**: `birth_date`から計算(誕生日を迎えていなければ1歳引く)
2. **BMI**: 直近の`body_weight_logs.weight`(kg) ÷ (`height_cm` ÷ 100)²。判定ラベルは[requirements.md](requirements.md) §7の日本肥満学会基準表に従う
3. **TDEE**(Mifflin-St Jeor式):
   - 男性: `10 × 体重kg + 6.25 × height_cm − 5 × 年齢 + 5`
   - 女性: `10 × 体重kg + 6.25 × height_cm − 5 × 年齢 − 161`
   - 「回答しない」の場合は男女式の平均、または活動係数と同様にプロフィール未入力時のエラーメッセージに倣い「性別が必要」として計算不可扱いにする(実装時に決定)
   - 上記に`activity_level`の係数(§2.11直前の`users`節参照)を掛けて1日の推定消費カロリーとする
   - サマリー表示では、この係数を掛ける前の値を「基礎代謝」、掛けた後の値との差分を「活動量」として2行で内訳表示する(2026-08-15、UI再設計フェーズ2で追加。バックエンドは`calculate_bmr()`として基礎代謝の算出をTDEE計算から独立した関数に切り出し、両方をAPIレスポンスに含める)
4. **目標カロリー**: `TDEE + (nutrition_goals.target_weight − 直近体重) × 7200 ÷ (target_date − 今日の日数)`。増量方向ならプラス、減量方向ならマイナスになる。`target_date`を過ぎている場合は§2.17のバナー表示に切り替え、この計算自体は行わない(残り日数が0または負になるため)
5. **PFCグラム数**(`pfc_mode`ごとに分岐):
   - `standard`: タンパク質 = 目標カロリー×15%÷4、脂質 = 目標カロリー×25%÷9、炭水化物 = 目標カロリー×60%÷4
   - `bulk`: タンパク質 = 直近体重×1.8(g)。脂質 = 目標カロリー×25%÷9。炭水化物 = (目標カロリー − タンパク質のkcal − 脂質のkcal)÷4
   - `cut`: タンパク質 = 直近体重×2.0(g)。脂質・炭水化物は`bulk`と同じ式
   - `custom`: `nutrition_goals.custom_protein_g`・`custom_fat_g`・`custom_carb_g`をそのまま使う
   - `bulk`/`cut`で目標カロリーが低すぎる等の理由で炭水化物が負の値になるケースは、0にクランプした上で「カロリー設定を見直してください」という警告を表示する(実装時に詳細UIを詰める)

### 2.17 目標達成日超過・進捗マイルストーンの判定(読み取り時に計算、§7対応)

- **達成日超過バナー**: 今日の日付が`nutrition_goals.target_date`より後、かつ直近体重が`target_weight`から一定の許容誤差(例: ±0.5kg、実装時に調整)を超えて離れている場合、ダッシュボードに「目標達成日を過ぎています。目標を見直しましょう」を表示する
- **進捗率**: `(start_weight − 直近体重) ÷ (start_weight − target_weight) × 100`(増量目標の場合は分子・分母とも符号が反転するだけで同じ式が使える)
- **目標BMI**: `target_weight ÷ (height_cm ÷ 100)²`(§2.16のBMI計算式のweightをtarget_weightに置き換えるだけ。プロフィールタブで現在のBMIと並べて表示する、2026-08-15追加)
- **マイルストーン表示**: 進捗率が25%/50%/75%/100%の各閾値を初めて超えたタイミングで、ダッシュボードにお祝いメッセージ・バッジを表示する。「初めて超えたタイミングか」の判定は、キャッシュ列を持たずに毎回`body_weight_logs`の履歴から再計算する(過去のどの記録日時点でも進捗率を計算できるため、「今日時点で初めて閾値を超えたか」を都度判定できる。§2.9と同じ「書き込み時に何も再計算・保存しない」方針を踏襲)

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
[ヘッダー: ロゴ「からだ手帳」(タップでホーム画面へ) / ようこそ、{display_name}さん]
[タブ: 運動 | 食事 | プロフィール]

--- ホーム画面(2026-08-15〜16、UI再設計フェーズ2で新設、design.md未記載だった項目を今回追記) ---
ロゴタップでいつでも戻れる、3タブ横断のサマリー画面。
[今日のからだ手帳]
  運動: 直近の記録(種目名・重量・回数)、記録が無ければ「記録なし」
  食事(摂取カロリー): 当日の合計kcal、目標設定済みなら目標との差分
  体重: 直近の体重・BMI(判定ラベル付き)
[運動を記録する / 食事を記録する / 体重を記録する] のショートカットカード(各タブの記録入力画面へ直接遷移)

--- 各タブ共通の画面構成パターン(2026-08-15〜16、UI再設計フェーズ2で導入) ---
運動・食事・プロフィールの3タブはいずれも「ランディング画面」と「詳細画面」に分割されている(タブ内画面切替、URLとは連動しない。フロント実装は共通ヘルパー`screenNav.ts`)。
ランディング画面は日常的に使う操作(サマリー・記録入力・直近の記録/ログ)をカードで並べ、頻度の低い管理系操作(種目管理・グラフ・サイクル管理・レシピ管理・独自食材管理・プロフィール編集・エクスポート・アカウント)は「詳細画面」としてリンクカードの先に分離し、各詳細画面には「← ○○に戻る」リンクを置く。

--- 運動タブ ---
[ランディング]
  サマリー(管理表をカードで表示): 自分のサイクルごとに区切って一覧表示
    各行: 種目名・現在重量・現在回数・現在セット・目標重量・目標回数・目標セット(現在側はドロップセット等で複数行になり得る、rowspanで表示)
    単位はヘッダー側にのみ表記(重量列ヘッダーを「重量(kg)」とする)。重量は小数点1桁で統一表示する(例: 60.0)
    種目が0件のサイクルはそのサイクル名の見出しのみ表示する(旧設計の「休憩の特別扱い」は廃止、§2.3参照)
    廃止済み(`is_discontinued=1`)の種目はこの一覧には表示しない
  記録を入力(§3.1)
  直近の記録(§3.3)
[詳細画面]
  種目を管理する(旧称: 管理表の編集、§3.2)
  グラフを見る: [種目選択ドロップダウン] [期間切り替え: 直近30日 / 直近3ヶ月 / 全期間]
    グラフ1: 重量推移(折れ線、その日の最大重量)
    グラフ2: 総作業量推移(折れ線、重量×回数の合計)
  サイクルを管理する: 追加・名称変更・削除(US-13)。管理表・記録入力が使う設定のため運動タブに属する

--- 食事タブ(§7対応) ---
[ランディング]
  サマリー: [達成日超過バナー・マイルストーンお祝い表示(該当時のみ)]
    維持カロリー(TDEE): 基礎代謝(BMR)+活動量の内訳を2行で表示(2026-08-15追加、§2.16参照)
    目標カロリー・目標PFCグラム数
    目標体重・達成日・PFC配分方式(標準/筋トレ向き/減量向き/カスタム)の設定フォーム
  食事ログ: 食事区分(朝食/昼食/夕食/間食)を選び、食品グループ絞り込み付きの検索(2026-08-15追加)またはレシピからカートに追加 → まとめて保存
    [期間切り替え: 直近30日 / 直近3ヶ月 / 全期間]
    グラフ: 摂取カロリー・PFC実績(折れ線) + 目標ライン
    直近の食事ログ一覧(食材/レシピ単位、レシピはグループとしてまとめて削除可能)
      - 各食材行に編集(食材・分量の直接変更)を追加(2026-08-15)
      - 各食事(meals、朝食/昼食/夕食/間食の単位)に写真の添付・差し替え・削除を追加(2026-08-15、§2.18)。一覧ではサムネイル表示、クリックで拡大
[詳細画面]
  レシピ管理: 作成・編集・削除・共有リンクの発行/停止(2026-08-15、§2.19)
  独自食材を管理する: 登録・編集・削除
  外食管理: 材料は分からないが名前と総量の栄養値だけ分かる食事(外食・コンビニ惣菜等)の登録・編集・削除(2026-08-18、§2.20)

--- プロフィールタブ ---
[ランディング]
  サマリー: 現在の体重・BMI・体脂肪率と、目標体重・目標BMI・達成日・進捗率を並べて表示(2026-08-15、体重・BMIを食事タブから移動して新設。目標体重は`nutrition_goals`を読み取り専用で表示し、編集は食事タブのサマリーに委ねる)
  体重を記録する(US-15): 日付・体重・体脂肪率(任意、2026-08-15追加)の入力欄
    [期間切り替え: 直近30日 / 直近3ヶ月 / 全期間]
    グラフ: 体重推移(折れ線)
    記録一覧、各行に編集・削除(2026-08-15追加。編集は日付・体重・体脂肪率の値を直接書き換え)
[詳細画面]
  プロフィールを編集する: 表示名・生年月日・性別・身長・活動レベル(US-14、§7で身長・活動レベルを追加)
  データのエクスポート: CSVダウンロードボタン(US-17)
  アカウント: テーマ切替(端末の設定に合わせる/ライト/ダーク)、ログアウト、確認ダイアログ付きの退会ボタン(US-16)
```

体重・設定・サイクル管理を独立タブから運動/プロフィール軸へ再編した理由: 5つのフラットなタブが並んでいるだけの構成から、「運動・食事・プロフィール」という3つの意味のあるまとまりに整理するため(体重はトレーニング成果ではなく身体情報なのでプロフィール軸、サイクル管理は管理表・記録入力が使う設定なので運動軸、プロフィール編集は体重記録と同じ「自分に関する情報」なのでまとめて配置)。

**デザイン(2026-08-15〜16、UI再設計フェーズ2)**: 事前にHTMLモックアップを作り込んでから実装した。ティール基調のデザイントークン(CSS変数)に全面刷新し、手動でのライト/ダーク切替(`localStorage`に保存、初回はOSの`prefers-color-scheme`に従う)に対応。サマリー・入力フォーム等の主要な塊はカード(`.card`)で視覚的に区切り、複数項目のフォームは横並びのフィールドグループ(`.field-row`)でまとめる。フェーズ1でトークン刷新のみ実施した際、カード化・フォームのグループ化が伴わずモックアップと見た目の乖離が大きくなった反省から、フェーズ7として改めてコンポーネントの視覚的な作り込み(カード・フィールドグループ・行区切りテーブル)を全画面に適用した(IA=情報設計の刷新とコンポーネントの見た目の刷新は別工程であることの教訓)。

種目選択ドロップダウンは、管理表と同じくサイクルごとに`<optgroup>`でグループ化する。廃止済み種目も元のサイクルのグループ内に含め、種目名の末尾に`(廃止)`と付けて区別する(過去の推移は引き続きグラフで参照できる)。

**実装上の注意(パフォーマンス)**: 運動タブ表示時に`get_board`・`get_logs`(全件)を並列で1回だけ取得し、管理表・グラフの両セクションで使い回す。グラフの種目選択・期間切り替えはAPIを呼び直さず、取得済みの全記録ログをブラウザ側でフィルタするだけで完結させる。記録の追加時のみグラフを取り直す(2026-08-15、タブ統合に伴い「タブを開くたびに再取得」から変更。管理表自体は記録追加直後には自動更新されない既存の挙動を維持している)。

### 3.1 入力フォームの項目詳細
- 日付: 今日の日付を自動入力(手動で変更可)
- セット欄の初期値: 種目を選択すると、その種目の`current`(直近の記録日のセット構成)をそのままセット欄の初期値として展開する(前回と同じ内容なら書き換えずそのまま送信できる)。現在値が無い種目は空欄3セット分を初期値にする
- 種目: 種目一覧からドロップダウンで選択(サイクルごとに`<optgroup>`でグループ化、選択時は`exercise_id`を送信)
- セット: デフォルトで3セット分の入力欄(重量・回数)を表示し、「セットを追加」ボタンで動的に増やせる。1〜2セットだけの入力でも送信できる方法は2通り: 「セットを削除」ボタンで行自体を減らす、または使わない行の重量・回数を両方空欄のまま送信する(重量・回数が両方空欄の行は未使用として無視される。片方だけ空欄の場合は入力不足のエラーになる)
- 各セット行には「コピー」ボタンを設置し、直前のセット行の重量・回数をそのままコピーできる。1セット目には表示されない

### 3.2 目標値の編集・種目の追加/削除(US-7対応)
運動タブ内に、管理表とは別の「管理表の編集」セクションを設ける。
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

以下は2026-08の初回移行時に実際に行った手順の記録(手順7・8は当時FTPで手動アップロードした)。**現在の継続的なデプロイはCI/CDで自動化されている**(architecture.md「CI/CD」参照)。この章は初回セットアップの記録として残す。

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

### 5.1 食事記録機能デプロイ時の追加手順(§7・§2.11〜2.17対応、実装時に実施)

1. `sql/migrate_add_meal_tracking.sql`をphpMyAdminのSQLタブで実行する(`users`への`height_cm`・`activity_level`列追加と、新規6テーブル`nutrition_goals`・`foods`・`custom_foods`・`recipes`・`recipe_items`・`meals`・`meal_items`のCREATE TABLEをまとめて含む。既存データへの影響はない)
2. `sql/foods_seed.sql`(2538件、`sql/import/generate_foods_sql.js`で文部科学省「日本食品標準成分表(八訂)増補2023年」から生成済み)をphpMyAdminのSQLタブで実行し、`foods`マスタを投入する。データ改訂版が出た場合は、新しいExcelを`sql/import/`に置いて同スクリプトを再実行すれば`sql/foods_seed.sql`を再生成できる(`TRUNCATE`込みなので再実行は安全)
3. 新規に環境構築する場合(本番の追加マイグレーションではなく、初回セットアップの場合)は、上記の代わりに`sql/schema.sql`(食事機能のテーブルを含む最新版)を実行すればよい
