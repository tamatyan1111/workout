<?php
// design.md §2.6「公開読み取りAPI」対応。グラフ用の記録ログを取得する。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);

try {
    $exerciseId = isset($_GET['exercise_id']) && $_GET['exercise_id'] !== ''
        ? (int) $_GET['exercise_id']
        : null;
    $dateFrom = $_GET['date_from'] ?? null;
    $dateTo = $_GET['date_to'] ?? null;

    $pdo = get_pdo();
    json_ok(['logs' => fetch_logs($pdo, $exerciseId, $dateFrom ?: null, $dateTo ?: null)]);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
