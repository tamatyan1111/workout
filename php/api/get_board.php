<?php
// design.md §2.10「ダッシュボードAPI」対応。全エンドポイントでログイン必須。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);

try {
    $userId = require_login();
    $pdo = get_pdo();
    json_ok(['exercises' => fetch_board($pdo, $userId)]);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
