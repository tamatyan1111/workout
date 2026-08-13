<?php
require_once __DIR__ . '/../../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $body = read_json_body();
    $token = require_field($body, 'token');
    $newPassword = require_password($body, 'new_password');

    $pdo = get_pdo();
    $tokenRow = find_valid_reset_token($pdo, hash_token($token));
    if (!$tokenRow) {
        json_error('invalid_or_expired_token', 400);
    }

    update_user_password($pdo, (int) $tokenRow['user_id'], hash_password($newPassword));
    mark_reset_token_used($pdo, (int) $tokenRow['id']);

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
