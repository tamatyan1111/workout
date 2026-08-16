-- PFC配分方式「カスタム」に、グラム数指定に加えて比率(%)指定を追加するための、
-- 既存本番DBに対する追加マイグレーション(2026-08-16)。
--
-- 実行手順(phpMyAdminのSQLタブで実行する想定):
--   1. (念のため)phpMyAdminでDB全体をエクスポートしてバックアップを取る
--   2. このファイルの内容を丸ごとSQLタブに貼り付けて実行する(新規カラムの追加とENUM値の追加のみで、
--      既存データへの影響はない。新規カラムはNULL許容のため既存行はNULLで埋まる)

ALTER TABLE nutrition_goals
  MODIFY COLUMN pfc_mode ENUM('standard', 'bulk', 'cut', 'custom', 'custom_ratio') NOT NULL DEFAULT 'standard';

ALTER TABLE nutrition_goals
  ADD COLUMN custom_protein_percent DECIMAL(4,1) NULL AFTER custom_carb_g,
  ADD COLUMN custom_fat_percent DECIMAL(4,1) NULL AFTER custom_protein_percent,
  ADD COLUMN custom_carb_percent DECIMAL(4,1) NULL AFTER custom_fat_percent;
