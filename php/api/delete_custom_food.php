<?php
require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $id = require_int($body, 'id');

    $pdo = get_pdo();
    if (!find_custom_food($pdo, $userId, $id)) {
        json_error('食材が見つかりません', 404);
    }
    if (custom_food_in_use($pdo, $id)) {
        json_error('has_recipes', 409);
    }

    delete_custom_food($pdo, $id);
    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
