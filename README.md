# たまちゃんの筋トレ管理

[![CI/CD](https://github.com/tamatyan1111/workout/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/tamatyan1111/workout/actions/workflows/ci-cd.yml)

筋トレの記録入力・進捗確認を行うWebアプリ。npm workspacesによるモノリポ構成で、ログイン必須のダッシュボード(フロントエンド、TypeScript)とAPI(バックエンド、PHP)を1つのリポジトリで管理している。将来的に無料で一般公開し、複数のユーザーがそれぞれ自分の記録を管理できる製品として育てる方針。

## アーキテクチャ

```mermaid
flowchart TD
    User["ユーザー(複数人、ログイン必須)"]
    Google["Google OAuth 2.0"]

    subgraph xserver["1つのサブドメインに集約されたホスティング環境"]
        Dashboard["ダッシュボード(静的HTML, SPA)<br/>・ログイン/サインアップ<br/>・管理表 / グラフ / 体重 / 設定タブ"]
        AuthAPI["認証API(PHP)<br/>/api/auth/*<br/>ログイン不要"]
        API["ダッシュボードAPI(PHP)<br/>/api/*<br/>全エンドポイントでログイン必須"]
        Shared["共有PHPライブラリ<br/>DB接続・クエリ・認証チェック・レスポンス整形"]
    end

    DB[("MySQL/MariaDB<br/>users / cycles / exercises / logs / body_weight_logs")]

    User -- "静的HTMLを取得" --> Dashboard
    Dashboard -- "同一オリジンfetch" --> AuthAPI
    Dashboard -- "同一オリジンfetch(セッションCookie付き)" --> API
    AuthAPI -- "Authorization Codeフロー" --> Google
    AuthAPI -.require.-> Shared
    API -.require.-> Shared
    Shared -- "PDO(user_idで必ず絞り込み)" --> DB

    classDef authNode fill:#4a1f1f,stroke:#d97757,color:#fff
    classDef appNode fill:#1f2f4a,stroke:#5b8fd9,color:#fff
    classDef dataNode fill:#1f3a2a,stroke:#5bbf8a,color:#fff
    classDef actor fill:#2a2a2a,stroke:#999,color:#fff
    classDef sharedNode fill:#3a2f4a,stroke:#a679d9,color:#fff
    classDef externalNode fill:#3a3a1f,stroke:#c9b458,color:#fff

    class AuthAPI authNode
    class Dashboard,API appNode
    class DB dataNode
    class Shared sharedNode
    class User actor
    class Google externalNode
```

設計判断の詳細(なぜこの構成にしたか)は [docs/architecture.md](docs/architecture.md)・[docs/design.md](docs/design.md) を参照。

## 技術スタック

| レイヤー | 技術 |
| :--- | :--- |
| フロントエンド | TypeScript + Vite(フレームワーク無し) |
| グラフ描画 | Chart.js |
| バックエンド | PHP(フレームワーク無し、PDO + プリペアドステートメント) |
| 認証 | セッションCookie、Google OAuth 2.0、メール/パスワード(bcrypt) |
| データベース | MySQL / MariaDB |
| モノリポ管理 | npm workspaces |
| フロントエンドテスト | Vitest + jsdom |
| バックエンドテスト | PHPUnit(Unit + Integration) |
| 静的解析 | ESLint + typescript-eslint / PHPStan + PHP_CodeSniffer(PSR-12) |
| CI | GitHub Actions |

## ディレクトリ構成

```
apps/
  dashboard/       ログイン必須のダッシュボード(管理表・グラフ・体重・設定タブ)
packages/
  shared/          型定義・ユーティリティ
php/
  private/         DB接続・共通クエリ・認証・バリデーション(Webから直接アクセス不可)
  api/             ダッシュボードAPI(全エンドポイントでログイン必須)
  api/auth/        認証API(サインアップ・ログイン・Google OAuth・パスワードリセット)
  tests/           PHPUnitテスト(Unit / Integration)
sql/
  schema.sql       テーブル定義
  seed.sql         ローカル開発・CI用の架空データ
docs/
  requirements.md / design.md / architecture.md  要件・設計の詳細ドキュメント
```

## ローカル開発

### フロントエンド

```bash
npm install
npm run dev --workspace=dashboard
```

認証まわり(セッションCookie)はダッシュボードとAPIが同一オリジンであることを前提にしているため、フロントエンドの単独起動(`npm run dev`)だけではログイン後の画面までは確認できない。実機での動作確認はデプロイ先での確認が必要。

### バックエンド(PHP)

PHP・MySQL/MariaDBのローカル環境自体が無い場合、Windowsなら`winget install --id PHP.PHP.8.2`・`winget install --id MariaDB.Server`で導入できる。`php.ini`で`pdo_mysql`・`mbstring`拡張を有効化すること(既定でコメントアウトされていることが多い)。

```bash
composer install
cp php/private/.env.example php/private/.env   # DB接続情報・Google OAuth・メール送信設定を編集
```

ローカルのMySQL/MariaDBに`sql/schema.sql`・`sql/seed.sql`を流すと架空データで動作確認できる。`sql/seed.sql`は個人情報を含まない架空のトレーニングデータ。食品マスタも試したい場合は`sql/foods_seed.sql`もあわせて流す(2538件、投入に数秒かかる)。

```bash
mysql -uroot -p workout_dev < sql/schema.sql
mysql -uroot -p workout_dev < sql/seed.sql
mysql -uroot -p workout_dev < sql/foods_seed.sql
```

認証込みでログイン後の画面まで確認したい場合は、ダッシュボードとAPIを同一オリジンから配信する必要がある(上記の通り同一オリジン前提のため、フロントエンドの`npm run dev`単独では確認できない)。`dev/router.php`を使うと、PHP組み込みサーバー1つでビルド済みダッシュボードとAPIをまとめて配信できる:

```bash
npm run build --workspace=apps/dashboard
php -S localhost:8000 -t apps/dashboard/dist dev/router.php
```

`http://localhost:8000/` にアクセスすると、本番相当の同一オリジン構成でサインアップ・ログイン・記録の追加等まで一通り確認できる。

## テスト

```bash
# フロントエンド(全workspace)
npm run test
npm run lint
npm run typecheck

# バックエンド
composer test          # PHPUnit(Unit + Integration)
composer run lint      # PHP_CodeSniffer(PSR-12)
composer run stan      # PHPStan
```

PHPUnitのIntegrationテストは実際のMySQL/MariaDBが必要(`DB_HOST`等の環境変数、または`php/private/.env`から接続情報を読む)。CIではMariaDBのサービスコンテナに対して実行している(`.github/workflows/ci-cd.yml`)。

### E2Eテスト(Playwright)

サインアップ→オンボーディング→全タブ表示、というゴールデンパスを実際のブラウザで検証する(`apps/dashboard/e2e/`)。ダッシュボードとAPIが同一オリジンである必要があるため、上記の`dev/router.php`と同じ構成で実行する。

```bash
npm run build --workspace=apps/dashboard
php -S localhost:8000 -t apps/dashboard/dist dev/router.php &
npx playwright install --with-deps chromium   # 初回のみ
npm run e2e --workspace=apps/dashboard
```

CIでは専用のMariaDBサービスコンテナ+`sql/schema.sql`のみ(架空データ不要、テストがサインアップから作る)に対して同様の構成で実行している。

## デプロイについて

本番は共有ホスティング(XServer)上で稼働しており、SSH/Composerが使えないため、`master`へのマージ後にFTPS(暗号化されたFTP)でファイルを転送する形でCDを組んでいる(`.github/workflows/ci-cd.yml`の`deploy`ジョブ)。

- トリガー: `master`へのpush(=PRのマージ)。`frontend`・`php`・`e2e`の3ジョブが全green必須(ブランチ保護)。加えて、実際にデプロイ対象のパス(`apps/dashboard/`・`packages/shared/`・`php/api/`・`php/private/`)が変わったPRだけが対象(`changes`ジョブ、`dorny/paths-filter`使用)。CI設定やdevDependencyだけの更新(Dependabotの`typescript`/`vitest`等)では承認待ちが発生しない。パスに関わらず強制的にデプロイしたい場合は、Actionsタブから`CI`ワークフローを`workflow_dispatch`で手動実行する
- 転送先: ダッシュボード(`apps/dashboard/dist`)をドキュメントルート直下に、`php/api`・`php/private`をそれぞれ`api/`・`private/`に、FTPSで同期(`.env`は転送対象から除外し、本番の実際の値を上書きしない)
- **承認ゲート**: GitHub Environments(`production`)の"Required reviewers"を使い、FTPS認証情報(Secrets)へのアクセス・実際の転送実行の直前で一時停止する。GitHub Actions上で「Review deployments」→「Approve and deploy」を押すまでデプロイは実行されない。これは複数人開発になった場合の安全策(誰でもマージはできても、本番への書き込みは指定した承認者だけができる)であり、DBマイグレーションが必要な変更は承認前に手動で`sql/migrate_*.sql`をphpMyAdminで実行しておく運用と組み合わせている
- DBマイグレーション自体はSSHが無いため今後も手動(phpMyAdminでSQLを実行)。ファイル転送だけが自動化の対象

## ライセンス

[MIT](LICENSE)
