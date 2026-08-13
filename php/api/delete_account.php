<?php
// design.md §1.3「アカウント削除の実装方針」対応。即時・取り消し不可。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $pdo = get_pdo();

    delete_user_account($pdo, $userId);
    logout_session();

    json_ok();
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
