<?php
require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);

try {
    $userId = require_login();
    $dateFrom = $_GET['date_from'] ?? null;
    $dateTo = $_GET['date_to'] ?? null;
    $limit = isset($_GET['limit']) && $_GET['limit'] !== '' ? (int) $_GET['limit'] : null;

    $pdo = get_pdo();
    json_ok(['logs' => fetch_body_weight_logs($pdo, $userId, $dateFrom ?: null, $dateTo ?: null, $limit)]);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
