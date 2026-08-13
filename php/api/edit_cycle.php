<?php
require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $id = require_int($body, 'id');
    $label = require_field($body, 'label');

    $pdo = get_pdo();
    $cycle = find_cycle($pdo, $userId, $id);
    if (!$cycle) {
        json_error('サイクルが見つかりません', 404);
    }
    if ($cycle['label'] !== $label && cycle_label_exists($pdo, $userId, $label)) {
        json_error('同じ名前のサイクルが既に存在します', 409);
    }

    update_cycle_label($pdo, $id, $label);
    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
