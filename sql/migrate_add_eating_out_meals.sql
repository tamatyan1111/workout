-- 「外食」機能(材料は分からないが名前と総量の栄養値だけ分かる食事の記録)を追加するための、
-- 既存本番DBに対する追加マイグレーション(2026-08-18)。
--
-- 実行手順(phpMyAdminのSQLタブで実行する想定):
--   1. (念のため)phpMyAdminでDB全体をエクスポートしてバックアップを取る
--   2. このファイルの内容を丸ごとSQLタブに貼り付けて実行する(新規テーブルの追加と、
--      meal_itemsへの新規カラム追加のみで、既存データへの影響はない)

CREATE TABLE eating_out_meals (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  name        VARCHAR(255) NOT NULL,
  kcal        DECIMAL(6,1) NOT NULL,
  protein_g   DECIMAL(6,2) NOT NULL,
  fat_g       DECIMAL(6,2) NOT NULL,
  carb_g      DECIMAL(6,2) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_eating_out_meals_user_id FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE meal_items
  ADD COLUMN eating_out_meal_id INT UNSIGNED NULL AFTER custom_food_id,
  ADD CONSTRAINT fk_meal_items_eating_out_meal_id FOREIGN KEY (eating_out_meal_id) REFERENCES eating_out_meals(id) ON DELETE SET NULL;
