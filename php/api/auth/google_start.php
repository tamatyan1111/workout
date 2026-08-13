<?php
// design.md §1.1「Googleログイン」対応。Googleの認可画面へリダイレクトする。
// stateをセッションに保存し、google_callback.php側でCSRF対策として検証する。

require_once __DIR__ . '/../../private/bootstrap.php';

$config = get_config();

try {
    start_session();
    $state = generate_random_token();
    $_SESSION['google_oauth_state'] = $state;

    header('Location: ' . google_auth_url($config, $state));
    exit;
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
