<?php
// design.md §2.6参照。同じ日に再送信した場合は既存行を上書きする(UPSERT)。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $loggedDate = require_date($body, 'logged_date');
    $weight = require_field($body, 'weight');
    if (!is_numeric($weight)) {
        json_error('体重は数値で指定してください', 400);
    }
    $bodyFatPercentage = optional_number($body, 'body_fat_percentage');

    $pdo = get_pdo();
    upsert_body_weight_log($pdo, $userId, $loggedDate, (float) $weight, $bodyFatPercentage);

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
