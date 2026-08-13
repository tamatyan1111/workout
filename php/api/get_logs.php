<?php
require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);

try {
    $userId = require_login();
    $exerciseId = isset($_GET['exercise_id']) && $_GET['exercise_id'] !== ''
        ? (int) $_GET['exercise_id']
        : null;
    $dateFrom = $_GET['date_from'] ?? null;
    $dateTo = $_GET['date_to'] ?? null;

    $pdo = get_pdo();
    json_ok(['logs' => fetch_logs($pdo, $userId, $exerciseId, $dateFrom ?: null, $dateTo ?: null)]);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
