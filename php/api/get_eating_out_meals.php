<?php
// 外食メニューの管理画面用。get_custom_foods.phpと同じ位置づけ(自分の登録分だけを一覧する)。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);

try {
    $userId = require_login();
    $pdo = get_pdo();
    json_ok(['meals' => fetch_eating_out_meals($pdo, $userId)]);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
