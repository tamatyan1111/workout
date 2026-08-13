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
    $cycle = find_cycle($pdo, $userId, $id);
    if (!$cycle) {
        json_error('サイクルが見つかりません', 404);
    }
    if (cycle_has_exercises($pdo, $id)) {
        json_error('has_exercises', 409);
    }

    delete_cycle($pdo, $id);
    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
