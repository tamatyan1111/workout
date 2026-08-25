<?php
// 食事を記録する画面の「よく使う内容」への登録。design.md未記載、UI再設計フェーズ2。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $masterFoodId = optional_int($body, 'master_food_id');
    $customFoodId = optional_int($body, 'custom_food_id');
    $quantityG = require_positive_number($body, 'quantity_g');

    if (count(array_filter([$masterFoodId, $customFoodId], fn ($v) => $v !== null)) !== 1) {
        json_error('master_food_id・custom_food_idのいずれか1つだけを指定してください', 400);
    }

    $pdo = get_pdo();
    $food = resolve_food_source($pdo, $userId, $masterFoodId, $customFoodId, null);
    if ($food === null) {
        json_error('食品が見つかりません', 404);
    }

    $id = create_meal_favorite($pdo, $userId, $masterFoodId, $customFoodId, $quantityG);

    json_ok(['id' => $id]);
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
