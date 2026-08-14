<?php
// トランザクションはcreate_recipe()側で完結する(design.md §2.14)。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $name = require_field($body, 'name');

    $pdo = get_pdo();
    $items = parse_recipe_items($pdo, $userId, $body['items'] ?? null);
    $id = create_recipe($pdo, $userId, $name, $items);

    json_ok(['id' => $id]);
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
