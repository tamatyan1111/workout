---
type: Project Index
title: たまちゃんの筋トレ管理
description: 仕様駆動開発で進める筋トレ管理サイトプロジェクトの資料目次
tags: [筋トレ管理]
timestamp: 2026-07-20T00:00:00Z
---
# たまちゃんの筋トレ管理

XServer(MySQL/PHP)1つのサブドメイン(`workout.tamachan-blog.com`)に構築する、筋トレ記録・進捗管理サイト。仕様駆動開発で進めている。2026-08にGoogle スプレッドシート + Google Apps Script構成から移行し、当初はGitHub Pagesで公開サイトを別ホストしていたが、「1アプリ=1サブドメイン」の方針でXServerに統合した。その後、将来的に無料で一般公開し複数ユーザーが使える製品に育てる方針に転換し、秘密URL方式からログイン認証を伴うマルチユーザー構成へ設計を刷新した(経緯は design.md §0・§0.1、architecture.md 参照)。

## ドキュメント

- [requirements.md](requirements.md) — 要件定義(背景・利用者・ユーザーストーリー・受け入れ基準)
- [design.md](design.md) — 設計(アーキテクチャ・データモデル・画面構成)
- [architecture.md](architecture.md) — アーキテクチャ図(図で見るシステム構成)

## 現在のステータス
マルチユーザー化(ログイン認証・複数ユーザー対応)は実装・本番デプロイ済みで運用中。筋トレ記録(サイクル・種目・記録・体重)に加えて、食事記録機能(カロリー・PFC管理、requirements.md §7)も実装済み。CI/CD(GitHub Actions、`.github/workflows/ci-cd.yml`)によるテスト自動化・本番デプロイの自動化も整備済み(architecture.md「CI/CD」参照)。実装タスクの詳細な記録はgitのコミット履歴を参照。

- 本番: https://workout.tamachan-blog.com/(Google/メールアドレスでログイン、無料で一般公開)
- ソースコード: https://github.com/tamatyan1111/workout(GitHub Pagesは使用せずソース管理のみ)
