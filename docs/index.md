---
type: Project Index
title: たまちゃんの筋トレ管理
description: 仕様駆動開発で進める筋トレ管理サイトプロジェクトの資料目次
tags: [筋トレ管理]
timestamp: 2026-07-20T00:00:00Z
---
# たまちゃんの筋トレ管理

XServer(MySQL/PHP)1つのサブドメイン(`workout.tamachan-blog.com`)に、公開サイト・API・入力ページをすべて集約して構築する、筋トレ記録・進捗公開サイト。仕様駆動開発で進めている。2026-08にGoogle スプレッドシート + Google Apps Script構成から移行し、当初はGitHub Pagesで公開サイトを別ホストしていたが、「1アプリ=1サブドメイン」の方針でXServerに統合した(経緯は design.md §0、architecture.md 参照)。

## ドキュメント

- [requirements.md](requirements.md) — 要件定義(背景・利用者・ユーザーストーリー・受け入れ基準)
- [design.md](design.md) — 設計(アーキテクチャ・データモデル・画面構成)
- [architecture.md](architecture.md) — アーキテクチャ図(図で見るシステム構成)

## 現在のステータス
完成・運用開始。実装タスクの詳細な記録はgitのコミット履歴を参照。

- 公開サイト: https://workout.tamachan-blog.com/
- 入力ページ: 同ドメイン配下の秘密URL(記録者のみ把握)
- ソースコード: https://github.com/tamatyan1111/workout(公開サイト。GitHub Pagesは使用せずソース管理のみ)
