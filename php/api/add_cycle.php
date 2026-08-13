<?php
require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $label = require_field($body, 'label');

    $pdo = get_pdo();
    if (cycle_label_exists($pdo, $userId, $label)) {
        json_error('同じ名前のサイクルが既に存在します', 409);
    }

    $id = create_cycle($pdo, $userId, $label);
    json_ok(['id' => $id]);
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
