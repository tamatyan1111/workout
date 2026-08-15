<?php
// design.md §2.18参照。写真だけを削除する(食事記録本体は残す)。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $mealId = require_int($body, 'meal_id');

    $pdo = get_pdo();
    $meal = find_meal($pdo, $userId, $mealId);
    if (!$meal) {
        json_error('食事記録が見つかりません', 404);
    }

    update_meal_photo($pdo, $mealId, null);
    delete_meal_photo_file($meal['photo_path']);

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
