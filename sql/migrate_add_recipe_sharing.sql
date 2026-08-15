-- レシピの共有リンク機能(design.md §2.19、requirements.md §7)を追加するための、
-- 既存本番DBに対する追加マイグレーション。
--
-- 実行手順(phpMyAdminのSQLタブで実行する想定):
--   1. (念のため)phpMyAdminでDB全体をエクスポートしてバックアップを取る
--   2. このファイルの内容を丸ごとSQLタブに貼り付けて実行する(recipesへのALTERのみで、
--      既存データへの影響はない)

ALTER TABLE recipes
  ADD COLUMN share_token_hash CHAR(64) NULL AFTER name,
  ADD UNIQUE KEY uq_recipes_share_token_hash (share_token_hash);
