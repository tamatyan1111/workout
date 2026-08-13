<?php
// design.md §2.10「認証API」対応。メールアドレス+パスワードでの新規登録。

require_once __DIR__ . '/../../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $body = read_json_body();
    $email = require_email($body, 'email');
    $password = require_password($body, 'password');
    $displayName = require_field($body, 'display_name');

    $pdo = get_pdo();
    if (find_user_by_email($pdo, $email)) {
        json_error('このメールアドレスは既に登録されています', 409);
    }

    $userId = create_user_with_password($pdo, $email, hash_password($password), $displayName);
    login_as($userId);

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
