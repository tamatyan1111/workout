# たまちゃんの筋トレ管理

筋トレの記録入力・進捗確認・管理表の公開を行うWebアプリ。npm workspacesによるモノリポ構成で、公開サイト・入力ページ(フロントエンド、TypeScript)とAPI(バックエンド、PHP)を1つのリポジトリで管理している。

## アーキテクチャ

```mermaid
flowchart TD
    Viewer["閲覧者(誰でも)"]
    Recorder["記録者(自分のみ)"]

    subgraph xserver["1つのサブドメインに集約されたホスティング環境"]
        PublicSite["公開サイト(静的HTML)<br/>・管理表タブ / グラフタブ"]
        PublicAPI["公開読み取りAPI(PHP)<br/>/api-public/"]

        subgraph secret["🔒 推測困難な長いパス配下"]
            InputPage["入力ページ(静的HTML)"]
            SecretAPI["書込・編集API(PHP)"]
        end

        Shared["共有PHPライブラリ<br/>DB接続・クエリ・レスポンス整形"]
    end

    DB[("MySQL/MariaDB<br/>cycles / exercises / logs")]

    Viewer -- "誰でも閲覧" --> PublicSite
    PublicSite -- "GET(同一オリジン)" --> PublicAPI
    Recorder -- "秘密パスを直接開く" --> InputPage
    InputPage -- "同一オリジンPOST" --> SecretAPI

    PublicAPI -.require.-> Shared
    SecretAPI -.require.-> Shared
    Shared -- PDO --> DB

    classDef secretNode fill:#4a1f1f,stroke:#d97757,color:#fff
    classDef publicNode fill:#1f2f4a,stroke:#5b8fd9,color:#fff
    classDef dataNode fill:#1f3a2a,stroke:#5bbf8a,color:#fff
    classDef actor fill:#2a2a2a,stroke:#999,color:#fff
    classDef sharedNode fill:#3a2f4a,stroke:#a679d9,color:#fff

    class InputPage,SecretAPI secretNode
    class PublicSite,PublicAPI publicNode
    class DB dataNode
    class Shared sharedNode
    class Recorder,Viewer actor
```

設計判断の詳細(なぜこの構成にしたか)は [docs/architecture.md](docs/architecture.md)・[docs/design.md](docs/design.md) を参照。

## 技術スタック

| レイヤー | 技術 |
| :--- | :--- |
| フロントエンド | TypeScript + Vite(フレームワーク無し) |
| グラフ描画 | Chart.js |
| バックエンド | PHP(フレームワーク無し、PDO + プリペアドステートメント) |
| データベース | MySQL / MariaDB |
| モノリポ管理 | npm workspaces |
| フロントエンドテスト | Vitest + jsdom |
| バックエンドテスト | PHPUnit(Unit + Integration) |
| 静的解析 | ESLint + typescript-eslint / PHPStan + PHP_CodeSniffer(PSR-12) |
| CI | GitHub Actions |

## ディレクトリ構成

```
apps/
  public-site/     公開サイト(誰でも閲覧、管理表・グラフ)
  input-page/      入力ページ(記録者専用、秘密パス配下にデプロイ)
packages/
  shared/          両アプリ共通の型・ユーティリティ
php/
  private/         DB接続・共通クエリ・バリデーション(Webから直接アクセス不可)
  api-public/      公開読み取りAPI
  secret-api/      秘密パス配下の書込・編集API
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
npm run dev --workspace=public-site   # または --workspace=input-page
```

### バックエンド(PHP)

```bash
composer install
cp php/private/.env.example php/private/.env   # DB接続情報を編集
```

ローカルにMySQL/MariaDBを用意し、`sql/schema.sql`・`sql/seed.sql`を流すと架空データで動作確認できる。`sql/seed.sql`は個人情報を含まない架空のトレーニングデータ。

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

PHPUnitのIntegrationテストは実際のMySQL/MariaDBが必要(`DB_HOST`等の環境変数、または`php/private/.env`から接続情報を読む)。CIではMariaDBのサービスコンテナに対して実行している(`.github/workflows/ci.yml`)。

## デプロイについて

本番は共有ホスティング(XServer)上で稼働しており、SSH/Composerが使えないためCI/CDによる自動デプロイは組んでいない。ビルド成果物(`apps/*/dist`)をFTPで手動アップロードする運用。CI自体は品質ゲート(lint・型チェック・テスト・ビルド確認)として独立して機能する。

## ライセンス

[MIT](LICENSE)
