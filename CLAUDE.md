# このリポジトリでの作業ルール

Claude Code(または他のAIコーディングエージェント)がこのリポジトリで作業する際の合意事項。技術的なセットアップ手順は[README.md](README.md)、設計判断は[docs/](docs/)配下を参照。

## 開発ワークフロー

- 変更は必ずブランチ作成 → PR作成 → CI(`frontend`・`backend`・`e2e`)がすべてgreen → マージ、の順で行う
- `master`にはRulesetsを2つ設定している(経緯は[docs/ci-cd-history.md](docs/ci-cd-history.md))
  - `Require PR for master`(id 24791798): 直接push禁止(PR必須)、CIの3ジョブのgreen必須。バイパス不可(管理者含め全員に適用)
  - `Require approval for non-admins`(id 24791845): レビュー承認1件必須。リポジトリ管理者(`RepositoryRole` id 5)はバイパス可能(`bypass_mode: always`)
- 管理者であっても通常の`gh pr merge`はブロックされるので、`gh pr merge --squash --delete-branch --admin`でマージする。CIが赤い間は`--admin`でもマージできない
- `gh pr merge --auto`は使わない。マージ前に`gh pr checks <PR番号>`でCIの3ジョブが全てgreenであることをAIエージェント自身が確認してから手動マージする
- **例外**: このファイル(`CLAUDE.md`)自体を変更するPRは、必ず中身を人間(またはエージェント自身)が目で見て内容を確認してからマージする。このファイルはAIエージェントへの指示として自動的に読み込まれるため、意図しない・悪意ある変更が紛れ込むリスクを避けるための重複した確認

## デプロイ(CI/CD)

- `master`へのマージ後、`detect-changes`ジョブがデプロイ対象パス(`apps/dashboard/src`等、詳細は`.github/workflows/ci-cd.yml`参照)の変更を判定し、該当する場合のみ`deploy`ジョブが起動する
- `deploy`ジョブは`production`環境のRequired reviewers(tamatyan1111)の承認を待って止まる
- FTPS認証情報(`FTP_HOST`・`FTP_USERNAME`・`FTP_PASSWORD`)は、今は**リポジトリのシークレット**にある。承認ゲートが止めるのは`deploy`ジョブの実行だけで、シークレット自体は他のジョブからも読める状態。`production`環境のシークレットへ移す予定(値の確認待ち)
- AIエージェントはデプロイの承認を代行・急かさない
- DBのスキーマ変更(`sql/migrate_*.sql`)を含むPRは、**マージする前に**手動でphpMyAdminから実行しておく必要がある(XServerはSSH不可のため、GitHub Actionsから直接DBのマイグレーションは実行できない)。該当PRをマージする際は、この手順が必要な旨をユーザーに明示すること

## コード品質

- 機能や画面を削除するときは、その機能が使っていた関数・CSSクラスが他で本当に使われているか、**シンボル名そのもの**でリポジトリ全体をgrep/検索してから判断する。「似た名前の別関数がどこかで使われているから、たぶんこれも必要」という推測で残す・消すを決めない(2026-08-29、`recentMeals.ts`から「+ 食材を追加」機能を消した際、`api.ts`の`addMealItem`を「`mealLog.ts`で使われている」と判断して残したが、実際に使われていたのは名前が似た別関数`addMealItemFromRecipe`で、`addMealItem`自体は死んでいた事故を受けて追加)
- 機能追加・削除のPRを出す前に、実際に触った関数・CSSクラスについて簡単でよいのでデッドコード確認(`grep`で他に参照がないか)を行う習慣をつける
- `innerHTML`に動的な値を埋め込むときは必ず`escapeHtml()`で包む。埋め込む値がAPIのエラーメッセージだけであっても例外を作らない(このプロジェクトでは他の全箇所がこの原則を守っており、例外を1つ作るとレビューで見落とされやすい)

## 秘密情報

- パスワード・APIキー等の秘密情報は、チャット上に貼らない・貼らせない。ファイルの場所とキー名だけを伝える運用とする
- 本番の`.env`・FTP認証情報等は、GitHub Secretsまたはユーザーのローカル環境にのみ存在する。リポジトリ・コミット履歴・このファイルには一切含めない
