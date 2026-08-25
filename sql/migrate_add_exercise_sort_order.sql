-- 種目管理画面で「同じサイクル内での並べ替え」ができるようにするための追加マイグレーション
-- (2026-08-21)。
--
-- 実行手順(phpMyAdminのSQLタブで実行する想定):
--   1. (念のため)phpMyAdminでDB全体をエクスポートしてバックアップを取る
--   2. このファイルの内容を丸ごとSQLタブに貼り付けて実行する
--      (新規カラム追加+既存行への初期値設定のみで、既存データの削除・上書きは無い)

ALTER TABLE exercises
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER target_sets;

-- 既存の種目には、今までの並び順(サイクルごとにid昇順)をそのままsort_orderとして与える
UPDATE exercises e
JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY cycle_id ORDER BY id) - 1 AS rn
  FROM exercises
) ranked ON ranked.id = e.id
SET e.sort_order = ranked.rn;
