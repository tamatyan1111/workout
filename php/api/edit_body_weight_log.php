<?php
// design.md §2.6参照。過去の記録の日付・体重を直接編集する。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $id = require_int($body, 'id');
    $loggedDate = require_date($body, 'logged_date');
    $weight = require_positive_number($body, 'weight');

    $pdo = get_pdo();
    if (!find_body_weight_log($pdo, $userId, $id)) {
        json_error('体重記録が見つかりません', 404);
    }

    $updated = update_body_weight_log($pdo, $userId, $id, $loggedDate, $weight);
    if (!$updated) {
        json_error('duplicate_date', 409);
    }

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
