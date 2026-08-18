# このリポジトリでの作業ルール

Claude Code(または他のAIコーディングエージェント)がこのリポジトリで作業する際の合意事項。技術的なセットアップ手順は[README.md](README.md)、設計判断は[docs/](docs/)配下を参照。

## 開発ワークフロー

- 変更は必ずブランチ作成 → PR作成 → CI(`frontend`・`backend`・`e2e`)がすべてgreen → マージ、の順で行う
- **重要(2026-08-18判明)**: 2026-08-16にリポジトリをPrivate化(Freeプランのまま)して以降、`master`への直接pushを禁止するブランチ保護そのものが機能しなくなっている(GitHub APIが`Upgrade to GitHub Pro or make this repository public to enable this feature`を返す。Privateリポジトリのブランチ保護はGitHub Pro/Team/Enterpriseが必要)。実際にPR #37で、`backend`(phpcs)が失敗した状態のまま`gh pr merge --auto`がすり抜けてマージされてしまう事故が発生した(実害はlintの行長警告のみで、`deploy`ジョブ自体はワークフロー内の`needs`条件により正しくスキップされたため本番への影響は無かった)
- そのため**`gh pr merge --auto`は使わない**。マージ前に`gh pr checks <PR番号>`等でCIの3ジョブ(`frontend`・`backend`・`e2e`)が全てgreenであることをAIエージェント自身が確認してから、`gh pr merge --squash`等で手動マージする(2026-08-18、ユーザーとの合意により「このまま手動で注意する運用を続ける」方針に決定。Public化・GitHub Proへのアップグレードは見送り)
- **例外**: このファイル(`CLAUDE.md`)自体を変更するPRも同様に、必ず中身を人間(またはエージェント自身)が目で見て内容を確認してからマージする。このファイルはAIエージェントへの指示として自動的に読み込まれるため、意図しない・悪意ある変更が紛れ込むリスクを避けるための重複した確認

## デプロイ(CI/CD)

- `master`へのマージ後、`detect-changes`ジョブがデプロイ対象パス(`apps/dashboard/src`等、詳細は`.github/workflows/ci-cd.yml`参照)の変更を判定し、該当する場合のみ`deploy`ジョブが起動する
- `deploy`ジョブは本来GitHub Environments(`production`)のRequired reviewersにより、FTPS認証情報へのアクセス・実際の転送実行の直前で一時停止する設計だが、**上記と同じ理由(Private+FreeプランではGitHub Pro以上が必要)で現在この承認ゲートも機能していない**。2026-08-18、PR #37→#38のマージ時に実際に検証済み: `master`へのマージ直後、承認ボタンを押さないまま`deploy`ジョブ(FTPS転送含む)が最後まで自動実行された
- **したがって「承認ボタンを押すまでデプロイが止まる」という技術的な強制力は現状無い**。それでも「AIエージェントはデプロイを代行・急かさない」という運用上の約束は維持する(マージすること自体が実質的に即デプロイを意味する、という前提で慎重に判断すること)
- DBのスキーマ変更(`sql/migrate_*.sql`)を含むPRは、**マージする前に**手動でphpMyAdminから実行しておく必要がある(XServerはSSH不可のため、GitHub Actionsから直接DBのマイグレーションは実行できない。上記の通りマージ=即デプロイのため、承認ボタンのタイミングではなくマージのタイミングを基準にする)。該当PRをマージする際は、この手順が必要な旨をユーザーに明示すること

## 秘密情報

- パスワード・APIキー等の秘密情報は、チャット上に貼らない・貼らせない。ファイルの場所とキー名だけを伝える運用とする
- 本番の`.env`・FTP認証情報等は、GitHub Secrets(Environment単位)またはユーザーのローカル環境にのみ存在する。リポジトリ・コミット履歴・このファイルには一切含めない
