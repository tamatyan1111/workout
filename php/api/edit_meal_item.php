<?php
// design.md §2.15参照。食材・分量を後から直す。meal_id・recipe_batch_idは変更不可。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $id = require_int($body, 'id');
    $masterFoodId = optional_int($body, 'master_food_id');
    $customFoodId = optional_int($body, 'custom_food_id');
    if (($masterFoodId === null) === ($customFoodId === null)) {
        json_error('master_food_idかcustom_food_idのどちらか一方を指定してください', 400);
    }
    $quantity = require_positive_number($body, 'quantity_g');

    $pdo = get_pdo();
    if (!find_meal_item($pdo, $userId, $id)) {
        json_error('食事記録が見つかりません', 404);
    }

    update_meal_item($pdo, $userId, $id, $masterFoodId, $customFoodId, $quantity);

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
