# CI/CD・ブランチ保護の経緯

[CLAUDE.md](../CLAUDE.md) の開発ワークフロー・デプロイのルールが、なぜ今の形になったかの記録。

## Private時代の制約(2026-08-16〜2026-10-09)

- 2026-08-16にリポジトリをPrivate化(Freeプランのまま)して以降、`master`への直接pushを禁止するブランチ保護そのものが機能しなくなっていた(GitHub APIが`Upgrade to GitHub Pro or make this repository public to enable this feature`を返す。Privateリポジトリのブランチ保護はGitHub Pro/Team/Enterpriseが必要)。2026-08-18に判明
- 実際にPR #37で、`backend`(phpcs)が失敗した状態のまま`gh pr merge --auto`がすり抜けてマージされてしまう事故が発生した(実害はlintの行長警告のみで、`deploy`ジョブ自体はワークフロー内の`needs`条件により正しくスキップされたため本番への影響は無かった)
- この事故を受けて、`gh pr merge --auto`は使わず、CIの3ジョブがgreenであることをAIエージェント自身が確認してから手動マージする方針になった(2026-08-18)
- 同じくPrivate+Freeプランでは、GitHub Environments(`production`)のRequired reviewersによる承認ゲートも機能していなかった。2026-08-18、PR #37→#38のマージ時に、承認ボタンを押さないまま`deploy`ジョブ(FTPS転送含む)が最後まで自動実行されたことを確認した

## Public化とRulesets(2026-10-09)

- リポジトリをPublicに変更し、`master`にRulesetsを2つ設定した(`Require PR for master`、`Require approval for non-admins`)
- `Require approval for non-admins`の管理者バイパスにより、管理者でも通常の`gh pr merge`はブロックされ(`the base branch policy prohibits the merge`)、`--admin`フラグが必須になった。テストPRで動作確認済み

## CIの必須化(2026-10-13)

- `production`環境のRequired reviewers(tamatyan1111)が設定済みであることを確認した
- `Require PR for master`に、CIの3ジョブ(`frontend`・`backend`・`e2e`)のgreenを必須として追加した。このRulesetはバイパス不可なので、`--admin`でもCIが赤ければマージできない
- FTPSの認証情報(`FTP_HOST`・`FTP_USERNAME`・`FTP_PASSWORD`)がリポジトリのシークレットにあり、承認前のジョブからも読めることがわかった。`production`環境のシークレットへ移す予定だが、元の値の確認が必要なため後回しにした
- ワークフローに`permissions: contents: read`と、`deploy`ジョブの`concurrency`(同時に1つだけ)を追加した
