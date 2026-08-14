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
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  logged_date DATE NOT NULL,
  weight      DECIMAL(5,2) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_body_weight_logs_user_id_logged_date (user_id, logged_date),
  KEY idx_body_weight_logs_user_id_logged_date (user_id, logged_date),
  CONSTRAINT fk_body_weight_logs_user_id FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
