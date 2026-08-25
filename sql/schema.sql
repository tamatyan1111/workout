-- design.md §2「データモデル」に対応
-- XServerのphpMyAdminで、新規作成したデータベースに対して1回だけ実行する。
--
-- 制約・インデックス名の命名規則: <種別>_<テーブル名>_<カラム名> (種別は fk/uq/idx)。
-- 個別に略称を使わず、テーブル名とカラム名から機械的に決まる形に統一している。

CREATE TABLE users (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email               VARCHAR(255) NULL,
  password_hash       VARCHAR(255) NULL,
  google_sub          VARCHAR(255) NULL,          -- Googleログイン利用者の一意ID(sub)
  display_name        VARCHAR(100) NOT NULL,
  birth_date          DATE NULL,
  gender              ENUM('male', 'female', 'unspecified') NOT NULL DEFAULT 'unspecified',
  height_cm           SMALLINT UNSIGNED NULL,     -- BMI・TDEE計算用(食事記録機能)
  activity_level      ENUM('sedentary', 'light', 'moderate', 'active') NULL,  -- TDEE計算の活動係数
  failed_login_count  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  failed_login_at     DATETIME NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_google_sub (google_sub)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE password_reset_tokens (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64) NOT NULL,             -- ランダムトークンのSHA-256。トークン本体はDBに残さない
  expires_at  DATETIME NOT NULL,
  used_at     DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_reset_tokens_token_hash (token_hash),
  CONSTRAINT fk_password_reset_tokens_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cycles (
  id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  label   VARCHAR(20) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cycles_user_id_label (user_id, label),
  CONSTRAINT fk_cycles_user_id FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE exercises (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED NOT NULL,
  cycle_id        INT UNSIGNED NOT NULL,           -- 種目は常にいずれかのサイクルに属する(廃止後も元のサイクルを保持する)
  is_discontinued TINYINT(1) NOT NULL DEFAULT 0,    -- 1 = 現在は行っていない種目(記録の新規入力対象からは除外、過去の記録・グラフでは引き続き参照する)
  name            VARCHAR(255) NOT NULL,
  target_weight   DECIMAL(5,2) NULL,                -- NULLは「目標重量なし」
  target_reps     SMALLINT UNSIGNED NULL,
  target_sets     SMALLINT UNSIGNED NULL,
  sort_order      INT NOT NULL DEFAULT 0,           -- 同じサイクル内での表示順(種目管理画面の並べ替え用)
  PRIMARY KEY (id),
  UNIQUE KEY uq_exercises_cycle_id_name (cycle_id, name),
  CONSTRAINT fk_exercises_user_id FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_exercises_cycle_id FOREIGN KEY (cycle_id) REFERENCES cycles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE logs (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED NOT NULL,
  exercise_id   INT UNSIGNED NOT NULL,
  logged_date   DATE NOT NULL,
  set_number    SMALLINT UNSIGNED NOT NULL,
  weight        DECIMAL(5,2) NULL,          -- NULL = 重量なし種目のセット
  reps          SMALLINT UNSIGNED NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logs_exercise_id_logged_date (exercise_id, logged_date),
  CONSTRAINT fk_logs_user_id FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_logs_exercise_id FOREIGN KEY (exercise_id)
    REFERENCES exercises(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE body_weight_logs (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id              INT UNSIGNED NOT NULL,
  logged_date          DATE NOT NULL,
  weight               DECIMAL(5,2) NOT NULL,
  body_fat_percentage  DECIMAL(4,1) NULL,       -- 任意項目。未入力可(UI再設計フェーズ2)
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_body_weight_logs_user_id_logged_date (user_id, logged_date),
  KEY idx_body_weight_logs_user_id_logged_date (user_id, logged_date),
  CONSTRAINT fk_body_weight_logs_user_id FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 以下、食事記録機能(design.md §2.11〜2.15)対応

CREATE TABLE nutrition_goals (
  id                          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id                     INT UNSIGNED NOT NULL,
  start_weight                DECIMAL(5,2) NOT NULL,   -- 設定時点の直近体重のスナップショット(進捗率計算の起点)
  target_weight               DECIMAL(5,2) NOT NULL,
  target_body_fat_percentage  DECIMAL(4,1) NULL,       -- 任意項目。未入力可(UI再設計フェーズ2)
  target_date                 DATE NOT NULL,
  pfc_mode                    ENUM('standard', 'bulk', 'cut', 'custom', 'custom_ratio') NOT NULL DEFAULT 'standard',
  custom_protein_g            DECIMAL(6,1) NULL,       -- pfc_mode='custom' のときのみ使用
  custom_fat_g                DECIMAL(6,1) NULL,
  custom_carb_g               DECIMAL(6,1) NULL,
  custom_protein_percent      DECIMAL(4,1) NULL,       -- pfc_mode='custom_ratio' のときのみ使用(3つ合計100%)
  custom_fat_percent          DECIMAL(4,1) NULL,
  custom_carb_percent         DECIMAL(4,1) NULL,
  created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_nutrition_goals_user_id_created_at (user_id, created_at),
  CONSTRAINT fk_nutrition_goals_user_id FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE foods (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  food_number           VARCHAR(10) NOT NULL,    -- 食品標準成分表の食品番号(5桁)
  food_group_code       CHAR(2) NOT NULL,        -- 食品群番号
  food_group_name       VARCHAR(50) NOT NULL,    -- 食品群名(例: 穀類、野菜類)。非正規化だが全18群固定で変動しないため許容
  name                  VARCHAR(255) NOT NULL,
  kcal_per_100g         DECIMAL(6,1) NOT NULL,
  protein_g_per_100g    DECIMAL(6,2) NULL,       -- 「-」(未測定)の食品が実データに数件あるためNULL許容
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

-- 材料は分からないが名前と総量の栄養値だけ分かる食事(外食・コンビニ惣菜等)。
-- custom_foodsと違い「100gあたり」ではなく「1食分の実値」をそのまま持つ(レシピと同じく
-- 1人分固定で登録する運用、量の調整はしない)。food_name_snapshot等と同じ理由でレシピの
-- 構成食材(recipe_items)としては使えない(材料不明という前提と矛盾するため)。
CREATE TABLE eating_out_meals (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  name        VARCHAR(255) NOT NULL,
  shop_name   VARCHAR(255) NULL,   -- 店名(任意項目、2026-08-18追加)
  kcal        DECIMAL(6,1) NOT NULL,
  protein_g   DECIMAL(6,2) NOT NULL,
  fat_g       DECIMAL(6,2) NOT NULL,
  carb_g      DECIMAL(6,2) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_eating_out_meals_user_id FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recipes (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           INT UNSIGNED NOT NULL,
  name              VARCHAR(255) NOT NULL,
  share_token_hash  CHAR(64) NULL,   -- 共有リンク用トークンのSHA-256。NULL=非公開、非NULL=共有中(design.md §2.19)
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_recipes_share_token_hash (share_token_hash),
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
  CONSTRAINT fk_recipe_items_custom_food_id FOREIGN KEY (custom_food_id) REFERENCES custom_foods(id)
  -- master_food_id・custom_food_idのどちらか一方のみ設定する制約はCHECK制約では表現しない。
  -- MariaDBは外部キー制約が張られた列をCHECK制約内で参照できないため(ERROR 1901)、
  -- parse_recipe_items()(php/private/queries.php)で担保する
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE meals (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  logged_date  DATE NOT NULL,
  meal_type    ENUM('breakfast', 'lunch', 'dinner', 'snack') NOT NULL,
  photo_path   VARCHAR(255) NULL,   -- 添付メモ写真(自動計算には使わない)
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
  eating_out_meal_id          INT UNSIGNED NULL,
  food_name_snapshot          VARCHAR(255) NOT NULL,
  kcal_per_100g_snapshot      DECIMAL(6,1) NOT NULL,
  protein_g_per_100g_snapshot DECIMAL(6,2) NOT NULL,
  fat_g_per_100g_snapshot     DECIMAL(6,2) NOT NULL,
  carb_g_per_100g_snapshot    DECIMAL(6,2) NOT NULL,
  quantity_g                  DECIMAL(7,1) NOT NULL,
  recipe_batch_id             CHAR(36) NULL,       -- 同じレシピ展開でまとめて追加された行の目印(UUID)
  recipe_name_snapshot        VARCHAR(255) NULL,
  eating_out_shop_name_snapshot VARCHAR(255) NULL, -- 外食の店名(任意項目、2026-08-19追加)
  created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_meal_items_meal_id (meal_id),
  KEY idx_meal_items_recipe_batch_id (recipe_batch_id),
  CONSTRAINT fk_meal_items_meal_id FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE,
  CONSTRAINT fk_meal_items_user_id FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_meal_items_master_food_id FOREIGN KEY (master_food_id) REFERENCES foods(id) ON DELETE SET NULL,
  CONSTRAINT fk_meal_items_custom_food_id FOREIGN KEY (custom_food_id) REFERENCES custom_foods(id) ON DELETE SET NULL,
  CONSTRAINT fk_meal_items_eating_out_meal_id FOREIGN KEY (eating_out_meal_id) REFERENCES eating_out_meals(id) ON DELETE SET NULL
  -- master_food_id・custom_food_id・eating_out_meal_idの排他制約はCHECK制約では表現しない(recipe_itemsと同じ理由、上記参照)。
  -- resolve_items_for_meal()(php/private/queries.php)で担保する
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 「食品+量」の組み合わせをよく使う内容として保存し、食事を記録する画面からワンタップで
-- カートに追加できるようにする(2026-08-21、design.md未記載、UI再設計フェーズ2)。
-- 外食は外食管理自体がすでに同じ役割(固定内容をワンタップ相当で呼び出す)を持つため対象外。
-- スナップショットは持たず、常に食品の最新の名前・栄養値を参照する(meal_itemsと異なり、
-- 「よく使う内容」自体はまだ食事として記録されていない、ただの呼び出し用テンプレートのため)。
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
  -- master_food_id・custom_food_idの排他制約はmeal_itemsと同じ理由でCHECK制約では表現しない。
  -- create_meal_favorite()(php/private/queries.php)で担保する
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
