-- design.md §5 手順0: マルチユーザー化の移行作業を始める前に、
-- 旧スキーマ(cycles/exercises/logs)のデータをDB内にスナップショットとして残しておく。
-- phpMyAdminのSQLタブで、他の移行手順と同じ流れで実行できるようにするためのもの。
--
-- 注意:
-- - CREATE TABLE ... LIKE ではなく CREATE TABLE ... AS SELECT を使う。
--   LIKE は外部キー制約までコピーしてしまい、後続の
--   `RENAME TABLE cycles TO old_cycles, ...` の際にバックアップ側の外部キーが
--   元テーブルを参照したままになって干渉する可能性があるため、
--   制約を持たないデータだけのコピーにしている。
-- - これはこのDB内での簡易バックアップであり、サーバー障害等への備えにはならない。
--   念のため、phpMyAdminの「エクスポート」機能でのファイルダウンロードも別途行うこと。
-- - 移行完了・動作確認が済んだら、このbackup_*テーブルは削除してよい
--   (DROP TABLE backup_cycles, backup_exercises, backup_logs;)。

CREATE TABLE backup_cycles AS SELECT * FROM cycles;
CREATE TABLE backup_exercises AS SELECT * FROM exercises;
CREATE TABLE backup_logs AS SELECT * FROM logs;

-- 件数確認(元テーブルと一致するはず)
SELECT
  (SELECT COUNT(*) FROM cycles) AS cycles_count,
  (SELECT COUNT(*) FROM backup_cycles) AS backup_cycles_count,
  (SELECT COUNT(*) FROM exercises) AS exercises_count,
  (SELECT COUNT(*) FROM backup_exercises) AS backup_exercises_count,
  (SELECT COUNT(*) FROM logs) AS logs_count,
  (SELECT COUNT(*) FROM backup_logs) AS backup_logs_count;
