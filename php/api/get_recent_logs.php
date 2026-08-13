<?php
require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);

try {
    $userId = require_login();
    $limit = isset($_GET['limit']) && $_GET['limit'] !== '' ? (int) $_GET['limit'] : 20;
    $pdo = get_pdo();
    json_ok(['logs' => fetch_recent_logs($pdo, $userId, $limit)]);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
