-- design.md §2「データモデル」に対応
-- XServerのphpMyAdminで、新規作成したデータベースに対して1回だけ実行する。

CREATE TABLE cycles (
  id    TINYINT UNSIGNED NOT NULL,
  label VARCHAR(20) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO cycles (id, label) VALUES
  (1, 'Push'), (2, 'Pull'), (3, 'Legs'), (4, 'Rest');

CREATE TABLE exercises (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cycle_id        TINYINT UNSIGNED NOT NULL,       -- 種目は常にいずれかのサイクルに属する(廃止後も元のサイクルを保持する)
  is_discontinued TINYINT(1) NOT NULL DEFAULT 0,   -- 1 = 現在は行っていない種目(記録の新規入力対象からは除外、過去の記録・グラフでは引き続き参照する)
  name            VARCHAR(255) NOT NULL,
  target_weight   DECIMAL(5,2) NULL,               -- NULLは「目標重量なし」
  target_reps     SMALLINT UNSIGNED NULL,
  target_sets     SMALLINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cycle_name (cycle_id, name),
  CONSTRAINT fk_exercises_cycle FOREIGN KEY (cycle_id) REFERENCES cycles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE logs (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  exercise_id   INT UNSIGNED NOT NULL,
  logged_date   DATE NOT NULL,
  set_number    SMALLINT UNSIGNED NOT NULL,
  weight        DECIMAL(5,2) NULL,          -- NULL = 重量なし種目のセット
  reps          SMALLINT UNSIGNED NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_exercise_date (exercise_id, logged_date),
  CONSTRAINT fk_logs_exercise FOREIGN KEY (exercise_id)
    REFERENCES exercises(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
