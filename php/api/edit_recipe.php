<?php
// edit_exercise.php等と同じ規約: 部分更新ではなく、常に名前・構成食材の全体を送ってもらう
// (itemsは丸ごと置き換え)。トランザクションはupdate_recipe()側で完結する(design.md §2.14)。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $id = require_int($body, 'id');
    $name = require_field($body, 'name');

    $pdo = get_pdo();
    if (!find_recipe($pdo, $userId, $id)) {
        json_error('レシピが見つかりません', 404);
    }
    $items = parse_recipe_items($pdo, $userId, $body['items'] ?? null);

    update_recipe($pdo, $userId, $id, $name, $items);

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
