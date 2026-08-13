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
自分専用ツール(秘密URL方式)としては完成・運用中。マルチユーザー化(ログイン認証・複数ユーザー対応)は2026-08に仕様策定が完了した段階で、実装はこれから。実装タスクの詳細な記録はgitのコミット履歴を参照。

- 現行(自分専用)版: https://workout.tamachan-blog.com/ + 同ドメイン配下の秘密URL(記録者のみ把握)
- ソースコード: https://github.com/tamatyan1111/workout(GitHub Pagesは使用せずソース管理のみ)
