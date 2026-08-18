-- 直近の履歴で外食の店名を独立した行として表示するため、meal_itemsに店名のスナップショット
-- 列を追加する既存本番DBに対する追加マイグレーション(2026-08-19)。
--
-- 実行手順(phpMyAdminのSQLタブで実行する想定):
--   1. (念のため)phpMyAdminでDB全体をエクスポートしてバックアップを取る
--   2. このファイルの内容を丸ごとSQLタブに貼り付けて実行する(NULL許容の新規カラム追加のみで、
--      既存データへの影響はない)

ALTER TABLE meal_items
  ADD COLUMN eating_out_shop_name_snapshot VARCHAR(255) NULL AFTER recipe_name_snapshot;
