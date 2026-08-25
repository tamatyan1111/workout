<?php
// 食事を記録する画面の「よく使う内容」削除。design.md未記載、UI再設計フェーズ2。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $id = require_int($body, 'id');

    $pdo = get_pdo();
    if (!find_meal_favorite($pdo, $userId, $id)) {
        json_error('見つかりません', 404);
    }

    delete_meal_favorite($pdo, $id);

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
