<?php
// design.md §2.6「公開読み取りAPI」対応。誰でも呼び出し可。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);

try {
    $pdo = get_pdo();
    json_ok(['exercises' => fetch_board($pdo)]);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
