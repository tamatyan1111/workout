<?php
// 独自食材の管理画面用。search_foods.phpは全ユーザー共通マスタと横断検索するため、
// 「自分の独自食材だけ」を一覧したい場合はこちらを使う。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);

try {
    $userId = require_login();
    $pdo = get_pdo();
    json_ok(['foods' => fetch_custom_foods($pdo, $userId)]);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
