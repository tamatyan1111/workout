<?php
// edit_exercise.php等と同じ規約: 部分更新ではなく、常に編集可能な全項目を送ってもらう。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $id = require_int($body, 'id');
    $name = require_field($body, 'name');
    $kcal = require_non_negative_number($body, 'kcal_per_100g');
    $protein = require_non_negative_number($body, 'protein_g_per_100g');
    $fat = require_non_negative_number($body, 'fat_g_per_100g');
    $carb = require_non_negative_number($body, 'carb_g_per_100g');

    $pdo = get_pdo();
    if (!find_custom_food($pdo, $userId, $id)) {
        json_error('食材が見つかりません', 404);
    }

    update_custom_food($pdo, $id, $name, $kcal, $protein, $fat, $carb);

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
