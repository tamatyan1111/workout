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

## 1. アーキテクチャ

```
[閲覧者] --誰でも--> [XServer: 公開サイト(静的HTML)] --GET(同一オリジン)--> [公開読み取りAPI(PHP)] --PDO--> [MySQL/MariaDB]

[記録者] --秘密パス--> [XServer: 入力ページ(静的HTML) + 書込API(PHP)] --同一オリジンPOST--> [同じMySQL]
```

**「1アプリ=1サブドメイン」の方針**により、公開サイト・公開読み取りAPI・入力ページ・書込APIをすべて**同じ1つのサブドメイン**(`workout.tamachan-blog.com`)配下に集約する。当初は公開サイトをGitHub Pagesで別ホストする設計だったが、ドメイン・リポジトリ命名がバラバラになる問題があったため、XServer側に統合した(旧構成はarchitecture.md参照)。

- **公開サイト**: `workout.tamachan-blog.com/`直下にビルド済み静的HTMLをFTPで配置する。呼び出すのは同一オリジンの**公開読み取りAPI**のみ
- **入力ページ**: 同じサブドメインの**秘密パス**(推測困難な長いランダム文字列をディレクトリ名に使う)にビルド済みの静的HTMLをFTPで配置する。書き込みAPIも同じ秘密パス配下に置くため、同一オリジンとなりCORS対応が一切不要になる
- 公開読み取りAPI・書き込みAPIはどちらも同じMySQLデータベースを参照する
- ソースコード(GitHubリポジトリ)は各パーツごとに分けて管理するが、GitHub Pages等のホスティング機能は使わず、あくまでソース管理としてのみ利用する

### 1.1 サブドメインとパスの使い分け(重要)

公開読み取りAPI・秘密パスAPIは、**同じ1つのサブドメイン**の下に両方置く。サブドメインを分けない理由:

無料SSL証明書(Let's Encrypt)は発行時にCT(Certificate Transparency)ログへ公開記録される。もし「入力ページ専用の秘密サブドメイン」を作ってSSLを取得すると、そのサブドメイン名自体が`crt.sh`等で誰でも検索可能になり、「秘密URL」という防御の前提が崩れてしまう。

そのため、**サブドメイン名自体は推測されてもよい前提**にし、その配下の秘密性は長いランダムな「パス」(例: `workout.tamachan-blog.com/x7f9k2m4q8w1zabc/`)で確保する。これは今のApps ScriptのexecURLが、長い推測困難なトークンを含んでいるのと同じ考え方。

### 1.2 セキュリティ方針
個人利用の小規模プロジェクトのため、当面は本格的な認証は導入しない。書き込み用のURL(パス)自体が推測困難な長い文字列であることのみを防御手段とする(旧設計からの方針を踏襲)。

**将来的な拡張**: 簡易ログイン機能を後日追加する予定。そのため書き込み系のPHPエンドポイントは、各ファイルの先頭に認証チェックの呼び出しを1行差し込むだけで済む構造にしておく(今回は実装しない)。

| 要素 | 使用サービス | 費用 |
| :--- | :--- | :--- |
| 公開サイト・API実行環境・データ保存 | XServer(スタンダードプラン、MySQL/MariaDB + PHP) | 既存契約内(追加費用なし) |
| ソースコード管理 | GitHub(ホスティングには使わない) | 無料 |
| フロントエンド技術スタック | Vite + TypeScript(素、フレームワークなし) | 無料 |
| グラフ描画ライブラリ | Chart.js | 無料 |

**CORS**: 公開サイト・公開読み取りAPI・入力ページ・書込APIはすべて同一オリジン(`workout.tamachan-blog.com`)のため、本番運用上はCORSヘッダー自体が不要。ただしローカル開発時(`npm run dev`の`localhost`)から公開読み取りAPIを呼べるよう、許可オリジンのホワイトリストに`http://localhost:5173`を含めている(`php/private/.env`の`PUBLIC_CORS_ORIGINS`)。

## 2. データモデル(MySQL/MariaDB)

### 2.1 `cycles` テーブル — サイクルのマスタ

```sql
CREATE TABLE cycles (
  id    TINYINT UNSIGNED NOT NULL,
  label VARCHAR(20) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO cycles (id, label) VALUES
  (1, 'Push'), (2, 'Pull'), (3, 'Legs'), (4, 'Rest');
```

4行固定の小さなマスタテーブル。「Push」等の表示ラベルをアプリのコードにハードコードせず、DB側の1箇所に持たせる(ラベルを変えたくなった場合もデータ更新だけで済む)。

### 2.2 `exercises` テーブル — 種目の基本情報・目標値

```sql
CREATE TABLE exercises (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cycle_id        TINYINT UNSIGNED NOT NULL,       -- 種目は常にいずれかのサイクルに属する(廃止後も元のサイクルを保持する)
  is_discontinued TINYINT(1) NOT NULL DEFAULT 0,   -- 1 = 現在は行っていない種目
  name            VARCHAR(255) NOT NULL,
  target_weight   DECIMAL(5,2) NULL,               -- NULLは「目標重量なし」(旧"-")
  target_reps     SMALLINT UNSIGNED NULL,
  target_sets     SMALLINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cycle_name (cycle_id, name),
  CONSTRAINT fk_exercises_cycle FOREIGN KEY (cycle_id) REFERENCES cycles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- `id`が実PK。旧設計の「サイクル+種目名の複合キー」は`UNIQUE(cycle_id, name)`制約として引き継ぎつつ、日々の照合は`exercise_id`の直接参照に一本化する(名前+サイクルでの検索ロジックは不要になる)
- **`category`列は持たない**。旧設計では`cycle`(1〜4)と`category`(Push/Pull/Legs/Rest)を両方持っていたが、両者は1対1で決まる(cycle=1は必ずPush、など)ため`category`は`cycle_id`への推移的従属になり第三正規形違反だった。表示ラベルは`cycles`テーブルとのJOINで得る
- 「廃止」は`cycle_id`とは独立した`is_discontinued`フラグで表現する。`cycle_id`は廃止後も元のサイクルを保持したままにする(例: ダンベルキックバックはPushのまま`is_discontinued=1`)。これにより、入力ページの記録対象・管理表からは除外しつつ、公開サイトのグラフでは引き続き元のサイクルのグループ内で選択・参照できる
- 現在値(現在重量/現在回数/現在セット)の列は**持たない**。2.4の通り読み取り時に`logs`から都度計算する
- 目標値(target_weight/target_reps/target_sets)は単一のスカラー値。複数行対応(将来の期間ごとの目標変更など)は今回スコープ外(YAGNI。必要になったら別テーブルで対応する)

### 2.3 `logs` テーブル — トレーニングごとの実績

```sql
CREATE TABLE logs (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  exercise_id   INT UNSIGNED NOT NULL,
  logged_date   DATE NOT NULL,
  set_number    SMALLINT UNSIGNED NOT NULL,
  weight        DECIMAL(5,2) NULL,          -- NULL = 重量なし種目のセット
  reps          SMALLINT UNSIGNED NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_exercise_date (exercise_id, logged_date),
  CONSTRAINT fk_logs_exercise FOREIGN KEY (exercise_id)
    REFERENCES exercises(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- `id`はDBの`AUTO_INCREMENT`に一本化。旧設計の「シート内の最大値+1を手動採番」ロジックは廃止
- `exercise_id`は`exercises.id`への外部キー。旧設計の「種目名+サイクルの組で管理表の行を特定する」照合ロジックはすべて不要になる
- 列名は`date`ではなく`logged_date`にする(`date`はSQLの型名と衝突する予約語のため、クエリで常にクォートが必要になり煩雑)
- `weight`は`DECIMAL(5,2)`(浮動小数点にしない)。2.5の現在値グルーピングは`(weight, reps)`の完全一致で行うため、浮動小数点誤差でグループが分裂する事故を避ける
- `ON DELETE RESTRICT`: ログが1件でも紐づく種目は削除できない。記録がある種目を使わなくなった場合は`is_discontinued`を`1`にする運用とする(物理削除は記録が0件の種目のみ)

### 2.4 重量なし種目の扱い(バリデーション)

エアロバイク・クランチ等、目標重量が無い種目は、記録の重量欄も空欄で送信可能とする。それ以外の種目は重量を必須項目として扱う。回数は全種目で必須。

ただし目標重量が無いのは「重量を使わない種目」だけでなく「廃止されて目標が無くなった種目」もあり得る(例: ダンベルキックバック、目標重量は無いが実際は7.5kgで記録していた)。これらを区別するため、`is_weight_based`という真偽値を**読み取り時にSQLで判定**して`getBoard`のレスポンスに含める(旧設計の2段階判定をSQLで再現)。

```sql
(e.target_weight IS NOT NULL
  OR EXISTS (SELECT 1 FROM logs l WHERE l.exercise_id = e.id AND l.weight IS NOT NULL)
) AS is_weight_based
```

1. 目標重量が設定されていれば、重量あり種目として確定する
2. 目標重量が無い場合、その種目の記録に重量ありの実績が過去に1件でもあれば「重量あり種目」、一度も無ければ「重量なし種目」とする

フロントエンド側はこの`is_weight_based`フラグを信頼するだけでよく、クライアント側で同じ判定ロジックを再実装しない。

### 2.5 「現在値」の自動算出ロジック(US-2対応、読み取り時に計算)

種目(`exercise_id`で特定)ごとに、記録の中から**直近の記録日**のデータを対象にする。

その日に行った**(重量, 回数)の組ごとにグルーピング**し、それぞれのグループを「重量・回数・そのセット数」として返す。ドロップセットのように日の中で重量が変わる場合でも、実際に行った組み合わせだけを正確に表現できる(例: 60kg×3回を1セット、50kg×10回を1セット、40kg×12回を3セット、という3グループ)。

`getBoard`用の一括クエリ(全種目分を1回で取得):

```sql
SELECT l.exercise_id, l.weight, l.reps, COUNT(*) AS sets
FROM logs l
INNER JOIN (
  SELECT exercise_id, MAX(logged_date) AS max_date FROM logs GROUP BY exercise_id
) latest ON latest.exercise_id = l.exercise_id AND latest.max_date = l.logged_date
GROUP BY l.exercise_id, l.weight, l.reps
ORDER BY l.exercise_id, l.weight DESC, l.reps DESC;
```

- 重量が全行`NULL`の種目(重量なし種目)は`GROUP BY weight, reps`が自動的に`reps`だけのグルーピングに縮退し、`ORDER BY weight DESC`も無効化される(全部NULLで同着)ため、**重量あり・なしで別クエリを用意する必要がない**
- 記録が0件の種目は現在値が空配列になる(特別扱い不要)
- PHP側でこの結果を`exercise_id`ごとにバケット分けし、`exercises`の一覧にアタッチする

記録ログへの追記・修正・削除があっても、**書き込み時に何かを再計算・保存する必要はない**。次に読み取られたときに常に最新の実データを反映する。

### 2.6 API仕様

レスポンス形式は英語キー・構造化配列に刷新する(旧: Sheetsの日本語ヘッダー名をそのままJSONキーにしていた)。`cycle`は`cycles`テーブルとJOINしたラベル込みのオブジェクトとして返す(廃止済み種目も元のサイクルのまま。`is_discontinued`で区別する)。

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

`current`配列は2.5のクエリの通り重量の降順で返す(上の例なら60→50→40kgの順)。フロントエンドは並び替えをせず、返ってきた順にそのまま表示してよい。

#### 公開読み取りAPI(`workout.<domain>/api-public/`、誰でも呼び出し可、URLは公開サイトのコードに含めてよい)
| endpoint | method | 用途 | 主なパラメータ |
| :--- | :--- | :--- | :--- |
| `get_board.php` | GET | 種目一覧(現在値・目標値込み) | なし |
| `get_logs.php` | GET | グラフ用の記録ログを取得 | `exercise_id?`, `date_from?`, `date_to?`(省略時は全件) |

#### 秘密パスAPI(`workout.<domain>/<秘密パス>/api/`、URLは記録者だけが知る)
`<秘密パス>/index.html`: 入力ページ本体(ビルド済み静的HTML、FTPで配置)

| endpoint | method | payload | response |
| :--- | :--- | :--- | :--- |
| `get_board.php` | GET | - | 公開APIと同じ |
| `get_recent_logs.php` | GET | `limit?`(既定20) | `{logs: [{id, exercise_id, exercise_name, cycle_id, logged_date, set_number, weight, reps}]}` |
| `add_log.php` | POST | `{exercise_id, logged_date, sets:[{weight,reps},...]}` | `{ids:[...]}` (setsと同じ順序で採番されたIDを返す) |
| `edit_log.php` | POST | `{id, logged_date, weight, reps}` | `{ok:true}` |
| `delete_log.php` | POST | `{id}` | `{ok:true}` |
| `add_exercise.php` | POST | `{cycle_id, name, target_weight?, target_reps?, target_sets?}` | `{id}` |
| `edit_exercise.php` | POST | `{id, target_weight?, target_reps?, target_sets?, discontinued?}` | `{ok:true}` |
| `delete_exercise.php` | POST | `{id}` | `{ok:true}` または `{ok:false, error:"has_logs"}`(記録が紐づく種目は削除不可) |

各PHPファイルは共通のレスポンス形式(`{"ok":true,...}` / `{"ok":false,"error":"..."}`)を返す。PDO+プリペアドステートメントのみを使用し、文字列連結SQLは書かない。DB接続・上記クエリ・レスポンスヘルパー等の共通ロジックは、公開API・秘密パスAPIの両方から共有する1箇所に置く(コピペで二重管理にしない)。

## 3. 画面構成

公開サイトは **1ページ構成**とし、タブ切り替えで「管理表」と「グラフ」を表示する(ページ遷移なし)。

```
[ヘッダー: たまちゃんの筋トレ管理]
[タブ: 管理表 | グラフ]

--- 管理表タブ ---
サイクルごとに区切って一覧表示
(サイクル1: Push / サイクル2: Pull / サイクル3: Legs / サイクル4: Rest)
各行: 種目名・現在重量・現在回数・現在セット・目標重量・目標回数・目標セット(現在側はドロップセット等で複数行になり得る、rowspanで表示)
単位はヘッダー側にのみ表記(重量列ヘッダーを「重量(kg)」とする)。重量は小数点1桁で統一表示する(例: 60.0)
サイクル4(休憩)は種目名「休憩」の1行のみ表示し、現在・目標等の列は空欄
廃止済み(`is_discontinued=1`)の種目はこの一覧には表示しない(現役メニューのみを表示する画面のため)

--- グラフタブ ---
[種目選択ドロップダウン] [期間切り替え: 直近30日 / 直近3ヶ月 / 全期間]
グラフ1: 重量推移(折れ線、その日の最大重量)
グラフ2: 総作業量推移(折れ線、重量×回数の合計)
```
種目選択ドロップダウンは、管理表と同じくサイクルごとに`<optgroup>`でグループ化する。廃止済み種目も元のサイクルのグループ内に含め、種目名の末尾に`(廃止)`と付けて区別する(過去の推移は引き続きグラフで参照できる)。

- 入力用ページ(秘密パス)は上記の公開1ページとは別に独立して用意し、公開ページからはリンクしない

**実装上の注意(パフォーマンス)**: ページ読み込み時に`get_board`・`get_logs`(全件)を並列で1回だけ取得し、管理表タブ・グラフタブの両方で使い回す。グラフタブの種目選択・期間切り替えはAPIを呼び直さず、取得済みの全記録ログをブラウザ側でフィルタするだけで完結させる。

### 3.1 入力フォームの項目詳細
- 日付: 今日の日付を自動入力(手動で変更可)
- セット欄の初期値: 種目を選択すると、その種目の`current`(直近の記録日のセット構成)をそのままセット欄の初期値として展開する(前回と同じ内容なら書き換えずそのまま送信できる)。現在値が無い種目は空欄3セット分を初期値にする
- 種目: 種目一覧からドロップダウンで選択。「休憩」(サイクルのラベルがRestの種目)はログ対象ではないため選択肢から除外する。種目名はサイクルをまたいで重複し得るため、ドロップダウンはサイクルごとに`<optgroup>`でグループ化して表示する(選択時はexercise_idを送信する)
- セット: デフォルトで3セット分の入力欄(重量・回数)を表示し、「セットを追加」ボタンで動的に増やせる。1〜2セットだけの入力でも送信できる方法は2通り: 「セットを削除」ボタンで行自体を減らす、または使わない行の重量・回数を両方空欄のまま送信する(重量・回数が両方空欄の行は未使用として無視される。片方だけ空欄の場合は入力不足のエラーになる)
- 各セット行には「コピー」ボタンを設置し、直前のセット行の重量・回数をそのままコピーできる。1セット目には表示されない

### 3.2 目標値の編集・種目の追加/削除(US-7対応)
入力ページに「管理表の編集」セクションを設ける。
- **目標値の編集**: 既存種目を一覧表示し、目標重量・目標回数・目標セットをその場で書き換えて保存できる(種目名・サイクルは変更不可、現在値はこの画面では編集不可)。対象行は`exercise_id`で特定する
- **廃止フラグの切り替え**: 各行に「廃止」チェックボックスを設け、目標値と同時に保存できる。ONにすると`cycle_id`はそのまま(元のサイクルに属したまま)で`is_discontinued`だけが立ち、記録フォーム・この一覧の入力対象からは除外される。公開サイトのグラフでは引き続き元のサイクルのグループ内から選択できる(新規追加した種目も含め、いつでもON/OFFを切り替え可能)
- **種目の追加**: サイクル・種目名・目標重量・目標回数・目標セットを入力して新しい種目を追加できる(`is_discontinued`は常に0で開始)。現在値は記録が無いため空配列になる(記録が蓄積され次第、読み取り時に自動的に現れる)。同名の種目でも異なるサイクルであれば追加できる
- **種目の削除**: 一覧から種目を選んで削除できる(対象は`exercise_id`で特定)。記録が1件でも紐づく種目は削除できない(DBの外部キー制約でも保護される)。使わなくなった種目は物理削除せず「廃止」フラグをONにする運用とする

### 3.3 記録の入力・修正・削除(US-5対応)
「記録を送信」「削除」「まとめて編集の保存」は、いずれもAPI応答を待ってから画面に結果を反映する、通常の同期的なフローとする。

**旧設計からの変更点**: Google Apps Script時代は1回のAPI呼び出しに数百ms〜数秒かかっていたため、応答を待たずに画面を更新する「楽観的更新」(仮IDの発行、裏での送信、後からの静かな差し替えなど)を導入していた。MySQL+PHP(同一/近傍サーバー)への移行後は1回の呼び出しが数十ms程度で済むため、その複雑さに見合うメリットが無くなった。送信中はボタンを一時的に無効化し「送信中...」等の軽い表示を行う程度に留め、仮ID・裏取り・バックグラウンド差し替えの仕組みは持たない。

- 記録追加: 送信ボタンを押すと送信中表示になり、`add_log`の応答が返ってから「直近の記録」欄とフォームを更新する
- 記録削除: 「削除」ボタンを押すと即座に`delete_log`を送信し、応答後に一覧から取り除く(確認ダイアログは表示しない)
- 一覧全体に対して1つだけ「まとめて編集」ボタンを設置する。押すと表示中の全行が同時に入力モード(日付・重量・回数を書き換え可能)に切り替わり、ボタンは「保存」に変わる。再度押すと、編集モードに入った時点の値と比較して実際に変更のあった行だけを送信対象にする(並列送信)。全件の応答が揃ってから一覧を更新する

## 4. 非機能要件
- 費用: 追加費用なし(既存のXServer契約の範囲内)
- 対応端末: スマートフォン・PCの両方でレイアウトが崩れないこと(レスポンシブ対応)
- 複数端末からのデータ同期: MySQLを単一の真実源とすることで実現
- 検索エンジン非公開: 公開サイト・入力ページの両方に`noindex`メタタグを設定し、クロール・インデックスを拒否する(US-9は公開サイトが対象。入力ページは秘密パスの防御をさらに補強する意味も兼ねて同様に設定している)

## 5. セットアップ手順(XServer)

1. XServerのサーバーパネルで新しいサブドメイン(`workout.<既存ドメイン>`)を作成し、無料独自SSLを発行する。DNS側は`*.<domain>`のワイルドカードAレコードが既にXServer自体を向いていれば追加設定不要(サブドメイン設定だけで済む)
2. MySQLデータベース・DBユーザーを新規作成する(データベース名・ユーザー名・パスワードを控える)
3. phpMyAdminから`sql/schema.sql`を実行し、`cycles`・`exercises`・`logs`テーブルを作成する(`cycles`はスキーマと同時に初期データも投入される)
4. Google Sheets側データからINSERT文の`.sql`ファイル(`sql/data.sql`)を生成し、phpMyAdminから実行してデータを移行する(生成に使ったワンショットの移行スクリプトは、移行完了後に削除済み)
5. 公開読み取りAPI(PHP)を`workout.<domain>/api-public/`にFTPでアップロードする。`php/private/.env.example`を`.env`としてコピーし、DB接続情報を設定する
6. 秘密パス(長いランダム文字列のディレクトリ名)を1つ決め、`workout.<domain>/<秘密パス>/api/`に秘密パスAPI(PHP)をFTPでアップロードする。このパスはリポジトリ・公開コードのどこにも記載しない
7. `input-page`をビルドし、`workout.<domain>/<秘密パス>/`に`index.html`としてFTPでアップロードする
8. `public-site`をビルドし、`workout.<domain>/`直下にFTPでアップロードする(同一オリジンになるため、API接続先は相対パスのまま動作する)。表・グラフが表示されることを確認する
9. 手順6・7のURL(秘密パス)から、記録の追加・修正・削除、目標編集、種目追加・削除が一通り動作することを確認する。書き込み後、公開ページにも反映されることを確認する
10. 新旧システムの表示を突き合わせて問題なければ、旧Google Apps Script・スプレッドシートは読み取り専用のフォールバックとしてしばらく残し、確認期間後に廃止する
11. GitHub Pagesで公開サイトを一時的にホストしていた場合は無効化する(リポジトリはソース管理としてのみ継続利用)
