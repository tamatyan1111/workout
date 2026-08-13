-- ローカル開発・CI用の架空データ(実際のトレーニング記録ではない)。
-- sql/schema.sql 実行後にこれを流すと、動作確認できる状態になる。
-- password_hash列はダミー値であり、このシードデータでログインすることはできない
-- (ログインのテストは php/tests 側で password_hash() を都度呼んで検証する)。

INSERT INTO users (id, email, password_hash, display_name, birth_date, gender) VALUES
  (1, 'seed-user@example.com', '$2y$10$dummydummydummydummydummydummydummydummydummydummydu', 'シードユーザー', '1990-01-01', 'unspecified');

INSERT INTO cycles (id, user_id, label) VALUES
  (1, 1, 'Push'), (2, 1, 'Pull'), (3, 1, 'Legs'), (4, 1, 'Rest');

INSERT INTO exercises (id, user_id, cycle_id, is_discontinued, name, target_weight, target_reps, target_sets) VALUES
  (1, 1, 1, 0, 'ベンチプレス', 60, 10, 3),
  (2, 1, 1, 0, 'ショルダープレス', 20, 12, 3),
  (3, 1, 2, 0, 'ラットプルダウン', 45, 10, 3),
  (4, 1, 2, 0, 'ダンベルカール', 12, 12, 3),
  (5, 1, 3, 0, 'スクワット', 70, 10, 3),
  (6, 1, 3, 0, 'プランク', NULL, 60, 3),
  (7, 1, 1, 1, 'ダンベルフライ', NULL, NULL, NULL);

INSERT INTO logs (user_id, exercise_id, logged_date, set_number, weight, reps) VALUES
  (1, 1, '2026-08-01', 1, 55, 10),
  (1, 1, '2026-08-01', 2, 55, 10),
  (1, 1, '2026-08-01', 3, 55, 8),
  (1, 1, '2026-08-08', 1, 60, 10),
  (1, 1, '2026-08-08', 2, 60, 10),
  (1, 1, '2026-08-08', 3, 60, 9),
  (1, 5, '2026-08-03', 1, 65, 10),
  (1, 5, '2026-08-03', 2, 65, 10),
  (1, 5, '2026-08-10', 1, 70, 10),
  (1, 5, '2026-08-10', 2, 70, 10),
  (1, 7, '2026-06-01', 1, 15, 12);

INSERT INTO body_weight_logs (user_id, logged_date, weight) VALUES
  (1, '2026-08-01', 68.5),
  (1, '2026-08-08', 68.2),
  (1, '2026-08-10', 68.0);
