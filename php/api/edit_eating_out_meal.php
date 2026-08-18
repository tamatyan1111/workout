<?php
// edit_custom_food.php等と同じ規約: 部分更新ではなく、常に編集可能な全項目を送ってもらう。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $id = require_int($body, 'id');
    $name = require_field($body, 'name');
    $shopName = optional_field($body, 'shop_name');
    $kcal = require_non_negative_number($body, 'kcal');
    $protein = require_non_negative_number($body, 'protein_g');
    $fat = require_non_negative_number($body, 'fat_g');
    $carb = require_non_negative_number($body, 'carb_g');

    $pdo = get_pdo();
    if (!find_eating_out_meal($pdo, $userId, $id)) {
        json_error('外食メニューが見つかりません', 404);
    }

    update_eating_out_meal($pdo, $id, $name, $shopName, $kcal, $protein, $fat, $carb);

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
