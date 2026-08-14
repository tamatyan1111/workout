<?php
require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);

try {
    $userId = require_login();
    $pdo = get_pdo();
    $user = find_user_by_id($pdo, $userId);
    if (!$user) {
        json_error('ユーザーが見つかりません', 404);
    }

    json_ok([
        'display_name' => $user['display_name'],
        'email' => $user['email'],
        'birth_date' => $user['birth_date'],
        'gender' => $user['gender'],
        'height_cm' => $user['height_cm'] !== null ? (int) $user['height_cm'] : null,
        'activity_level' => $user['activity_level'],
    ]);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
