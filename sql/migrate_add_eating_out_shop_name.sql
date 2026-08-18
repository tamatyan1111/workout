-- 外食メニューに「店名」(任意項目)を追加するための、既存本番DBに対する追加マイグレーション
-- (2026-08-18)。
--
-- 実行手順(phpMyAdminのSQLタブで実行する想定):
--   1. (念のため)phpMyAdminでDB全体をエクスポートしてバックアップを取る
--   2. このファイルの内容を丸ごとSQLタブに貼り付けて実行する(NULL許容の新規カラム追加のみで、
--      既存データへの影響はない)

ALTER TABLE eating_out_meals
  ADD COLUMN shop_name VARCHAR(255) NULL AFTER name;
