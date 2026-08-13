<?php
require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $displayName = require_field($body, 'display_name');
    $birthDate = optional_date($body, 'birth_date');
    $gender = optional_gender($body, 'gender');

    $pdo = get_pdo();
    update_user_profile($pdo, $userId, $displayName, $birthDate, $gender);

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
