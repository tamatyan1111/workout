<?php
// design.md §2.19: レシピの共有リンクを発行する。既に共有中でも常に新しいトークンで
// 上書きする(旧リンクは自動的に無効化される)。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $id = require_int($body, 'id');

    $pdo = get_pdo();
    if (!find_recipe($pdo, $userId, $id)) {
        json_error('レシピが見つかりません', 404);
    }

    $token = enable_recipe_sharing($pdo, $userId, $id);
    $shareUrl = $config['app_base_url'] . '/?share_recipe=' . urlencode($token);

    json_ok(['share_url' => $shareUrl]);
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
