-- 食事を記録する画面の「よく使う内容(食品+量)をワンタップで追加」機能のための
-- 追加マイグレーション(2026-08-21)。
--
-- 実行手順(phpMyAdminのSQLタブで実行する想定):
--   1. (念のため)phpMyAdminでDB全体をエクスポートしてバックアップを取る
--   2. このファイルの内容を丸ごとSQLタブに貼り付けて実行する(新規テーブル追加のみで、
--      既存データへの影響はない)

CREATE TABLE meal_favorites (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED NOT NULL,
  master_food_id  INT UNSIGNED NULL,
  custom_food_id  INT UNSIGNED NULL,
  quantity_g      DECIMAL(7,1) NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_meal_favorites_user_id FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_meal_favorites_master_food_id FOREIGN KEY (master_food_id) REFERENCES foods(id) ON DELETE CASCADE,
  CONSTRAINT fk_meal_favorites_custom_food_id FOREIGN KEY (custom_food_id) REFERENCES custom_foods(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
