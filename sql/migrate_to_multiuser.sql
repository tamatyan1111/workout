-- 単一ユーザー版(旧cycles/exercises/logs、user_id列なし)から、マルチユーザー版の
-- 新スキーマへ既存データを移行する1回限りのスクリプト(design.md §0.1参照)。
--
-- 前提となる手順(phpMyAdminのSQLタブで実行する想定):
--   1. (念のため)phpMyAdminでDB全体をエクスポートしてバックアップを取る
--   2. 次を実行して旧テーブルをリネームする(外部キー制約は自動的に付いてくる):
--        RENAME TABLE cycles TO old_cycles, exercises TO old_exercises, logs TO old_logs;
--   3. sql/schema.sql を実行する(新テーブル一式を作成。旧テーブルはold_*に退避済みなので衝突しない)
--   4. ダッシュボードにアクセスし、自分のアカウントをサインアップ「だけ」する。
--      オンボーディング画面が出た状態のままでよく、ここでサイクルを作らないこと
--      (作ってしまうと、このスクリプトのINSERTがUNIQUE制約(user_id, label)に
--      引っかかってエラーになる)
--   5. 次のクエリで自分のuser_idを調べ、下のSET文を書き換える:
--        SELECT id, email FROM users;
--   6. このファイルの内容を丸ごとphpMyAdminのSQLタブに貼り付けて実行する
--      (SET @user_id は後続の全クエリで同じセッション内で使われる)
--   7. 末尾のSELECT文で旧テーブルと新テーブルの件数が一致することを確認する
--   8. 問題なければ以下を実行して旧テーブルを削除する:
--        DROP TABLE old_logs, old_exercises, old_cycles;

SET @user_id = 1; -- ← 手順5で調べた実際のuser_idに書き換える

-- サイクルの移行(旧cycles.id 1〜4 → 新cyclesの新しいAUTO_INCREMENT id)
INSERT INTO cycles (user_id, label)
SELECT @user_id, label FROM old_cycles ORDER BY id;

-- 種目の移行(旧cycle_idを、ラベル一致で対応する新cycle_idに変換する)
INSERT INTO exercises (user_id, cycle_id, is_discontinued, name, target_weight, target_reps, target_sets)
SELECT @user_id, c.id, oe.is_discontinued, oe.name, oe.target_weight, oe.target_reps, oe.target_sets
FROM old_exercises oe
JOIN old_cycles oc ON oc.id = oe.cycle_id
JOIN cycles c ON c.user_id = @user_id AND c.label = oc.label;

-- 記録の移行(旧exercise_idを、(サイクルラベル, 種目名)の組で対応する新exercise_idに変換する)
INSERT INTO logs (user_id, exercise_id, logged_date, set_number, weight, reps, created_at)
SELECT @user_id, e.id, ol.logged_date, ol.set_number, ol.weight, ol.reps, ol.created_at
FROM old_logs ol
JOIN old_exercises oe ON oe.id = ol.exercise_id
JOIN old_cycles oc ON oc.id = oe.cycle_id
JOIN cycles c ON c.user_id = @user_id AND c.label = oc.label
JOIN exercises e ON e.user_id = @user_id AND e.cycle_id = c.id AND e.name = oe.name;

-- 件数確認(旧テーブルと新テーブル(自分のuser_id分)で一致するはず)
SELECT
  (SELECT COUNT(*) FROM old_cycles) AS old_cycles_count,
  (SELECT COUNT(*) FROM cycles WHERE user_id = @user_id) AS new_cycles_count,
  (SELECT COUNT(*) FROM old_exercises) AS old_exercises_count,
  (SELECT COUNT(*) FROM exercises WHERE user_id = @user_id) AS new_exercises_count,
  (SELECT COUNT(*) FROM old_logs) AS old_logs_count,
  (SELECT COUNT(*) FROM logs WHERE user_id = @user_id) AS new_logs_count;
