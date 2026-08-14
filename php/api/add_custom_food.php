<?php
require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $name = require_field($body, 'name');
    $kcal = require_non_negative_number($body, 'kcal_per_100g');
    $protein = require_non_negative_number($body, 'protein_g_per_100g');
    $fat = require_non_negative_number($body, 'fat_g_per_100g');
    $carb = require_non_negative_number($body, 'carb_g_per_100g');

    $pdo = get_pdo();
    $id = create_custom_food($pdo, $userId, $name, $kcal, $protein, $fat, $carb);

    json_ok(['id' => $id]);
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
