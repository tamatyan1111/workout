<?php
require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);

try {
    $userId = require_login();
    $pdo = get_pdo();
    json_ok(['goal' => fetch_latest_nutrition_goal($pdo, $userId)]);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
