<?php
// design.md §2.10「認証API」対応。メールアドレス+パスワードでのログイン。
// design.md §1.1「レート制限」: 直近15分で5回連続失敗しているアカウントは一時的にロックする。

require_once __DIR__ . '/../../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $body = read_json_body();
    $email = require_email($body, 'email');
    $password = require_field($body, 'password');

    $pdo = get_pdo();
    $user = find_user_by_email($pdo, $email);
    if (!$user || $user['password_hash'] === null) {
        json_error('メールアドレスまたはパスワードが正しくありません', 401);
    }
    if (is_login_locked($user)) {
        json_error('ログイン試行回数が上限に達しました。しばらくしてから再度お試しください', 429);
    }
    if (!verify_password($password, $user['password_hash'])) {
        record_login_failure($pdo, (int) $user['id']);
        json_error('メールアドレスまたはパスワードが正しくありません', 401);
    }

    reset_login_failure($pdo, (int) $user['id']);
    login_as((int) $user['id']);

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
