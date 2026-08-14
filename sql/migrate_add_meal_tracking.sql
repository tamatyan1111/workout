-- 食事記録機能(design.md §2.11〜2.15、§7)を追加するための、既存本番DBに対する追加マイグレーション。
-- 初回のマルチユーザー化移行(sql/migrate_to_multiuser.sql)が完了済みのDBに対して実行する想定。
--
-- 実行手順(phpMyAdminのSQLタブで実行する想定):
--   1. (念のため)phpMyAdminでDB全体をエクスポートしてバックアップを取る
--   2. このファイルの内容を丸ごとSQLタブに貼り付けて実行する(usersへのALTERと新規6テーブルのCREATEのみで、
--      既存データへの影響はない)
--   3. sql/foods_seed.sql を実行し、foodsマスタ(文部科学省 日本食品標準成分表データ)を投入する

ALTER TABLE users
  ADD COLUMN height_cm SMALLINT UNSIGNED NULL AFTER gender,
  ADD COLUMN activity_level ENUM('sedentary', 'light', 'moderate', 'active') NULL AFTER height_cm;

CREATE TABLE nutrition_goals (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id             INT UNSIGNED NOT NULL,
  start_weight        DECIMAL(5,2) NOT NULL,
  target_weight       DECIMAL(5,2) NOT NULL,
  target_date         DATE NOT NULL,
  pfc_mode            ENUM('standard', 'bulk', 'cut', 'custom') NOT NULL DEFAULT 'standard',
  custom_protein_g    DECIMAL(6,1) NULL,
  custom_fat_g        DECIMAL(6,1) NULL,
  custom_carb_g       DECIMAL(6,1) NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_nutrition_goals_user_id_created_at (user_id, created_at),
  CONSTRAINT fk_nutrition_goals_user_id FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE foods (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  food_number           VARCHAR(10) NOT NULL,
  food_group_code       CHAR(2) NOT NULL,
  food_group_name       VARCHAR(50) NOT NULL,
  name                  VARCHAR(255) NOT NULL,
  kcal_per_100g         DECIMAL(6,1) NOT NULL,
  protein_g_per_100g    DECIMAL(6,2) NULL,
  fat_g_per_100g        DECIMAL(6,2) NULL,
  carb_g_per_100g       DECIMAL(6,2) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_foods_food_number (food_number),
  KEY idx_foods_food_group_code (food_group_code),
  FULLTEXT KEY ftx_foods_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE custom_foods (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id               INT UNSIGNED NOT NULL,
  name                  VARCHAR(255) NOT NULL,
  kcal_per_100g         DECIMAL(6,1) NOT NULL,
  protein_g_per_100g    DECIMAL(6,2) NOT NULL,
  fat_g_per_100g        DECIMAL(6,2) NOT NULL,
  carb_g_per_100g       DECIMAL(6,2) NOT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_custom_foods_user_id FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recipes (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  name        VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_recipes_user_id FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recipe_items (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipe_id       INT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NOT NULL,
  master_food_id  INT UNSIGNED NULL,
  custom_food_id  INT UNSIGNED NULL,
  quantity_g      DECIMAL(7,1) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_recipe_items_recipe_id FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  CONSTRAINT fk_recipe_items_user_id FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_recipe_items_master_food_id FOREIGN KEY (master_food_id) REFERENCES foods(id),
  CONSTRAINT fk_recipe_items_custom_food_id FOREIGN KEY (custom_food_id) REFERENCES custom_foods(id),
  CONSTRAINT chk_recipe_items_food_ref CHECK ((master_food_id IS NULL AND custom_food_id IS NOT NULL) OR (master_food_id IS NOT NULL AND custom_food_id IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE meals (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  logged_date  DATE NOT NULL,
  meal_type    ENUM('breakfast', 'lunch', 'dinner', 'snack') NOT NULL,
  photo_path   VARCHAR(255) NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_meals_user_id_logged_date (user_id, logged_date),
  CONSTRAINT fk_meals_user_id FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE meal_items (
  id                          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  meal_id                     INT UNSIGNED NOT NULL,
  user_id                     INT UNSIGNED NOT NULL,
  master_food_id              INT UNSIGNED NULL,
  custom_food_id              INT UNSIGNED NULL,
  food_name_snapshot          VARCHAR(255) NOT NULL,
  kcal_per_100g_snapshot      DECIMAL(6,1) NOT NULL,
  protein_g_per_100g_snapshot DECIMAL(6,2) NOT NULL,
  fat_g_per_100g_snapshot     DECIMAL(6,2) NOT NULL,
  carb_g_per_100g_snapshot    DECIMAL(6,2) NOT NULL,
  quantity_g                  DECIMAL(7,1) NOT NULL,
  recipe_batch_id             CHAR(36) NULL,
  recipe_name_snapshot        VARCHAR(255) NULL,
  created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_meal_items_meal_id (meal_id),
  KEY idx_meal_items_recipe_batch_id (recipe_batch_id),
  CONSTRAINT fk_meal_items_meal_id FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE,
  CONSTRAINT fk_meal_items_user_id FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_meal_items_master_food_id FOREIGN KEY (master_food_id) REFERENCES foods(id) ON DELETE SET NULL,
  CONSTRAINT fk_meal_items_custom_food_id FOREIGN KEY (custom_food_id) REFERENCES custom_foods(id) ON DELETE SET NULL,
  CONSTRAINT chk_meal_items_food_ref CHECK ((master_food_id IS NULL AND custom_food_id IS NOT NULL) OR (master_food_id IS NOT NULL AND custom_food_id IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
