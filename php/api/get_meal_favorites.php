<?php
// 食事を記録する画面の「よく使う内容」一覧。design.md未記載、UI再設計フェーズ2。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);

try {
    $userId = require_login();
    $pdo = get_pdo();
    json_ok(['favorites' => fetch_meal_favorites($pdo, $userId)]);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
