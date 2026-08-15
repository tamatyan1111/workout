-- 体脂肪率(任意項目)を追加するための、既存本番DBに対する追加マイグレーション
-- (UI再設計フェーズ2、design.md未記載)。
--
-- 実行手順(phpMyAdminのSQLタブで実行する想定):
--   1. (念のため)phpMyAdminでDB全体をエクスポートしてバックアップを取る
--   2. このファイルの内容を丸ごとSQLタブに貼り付けて実行する(いずれも新規カラムの追加のみで、
--      既存データへの影響はない。NULL許容のため既存行はNULLで埋まる)

ALTER TABLE body_weight_logs
  ADD COLUMN body_fat_percentage DECIMAL(4,1) NULL AFTER weight;

ALTER TABLE nutrition_goals
  ADD COLUMN target_body_fat_percentage DECIMAL(4,1) NULL AFTER target_weight;
