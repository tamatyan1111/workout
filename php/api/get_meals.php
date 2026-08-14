<?php
require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);

try {
    $userId = require_login();
    $dateFrom = $_GET['date_from'] ?? null;
    $dateTo = $_GET['date_to'] ?? null;

    $pdo = get_pdo();
    json_ok(['meals' => fetch_meals($pdo, $userId, $dateFrom ?: null, $dateTo ?: null)]);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
