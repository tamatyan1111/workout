<?php
require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);

try {
    $userId = require_login();
    $pdo = get_pdo();
    $user = find_user_by_id($pdo, $userId);
    if (!$user) {
        // セッションのuser_idに対応するユーザーが存在しない(例: 別タブ/別端末でアカウント削除(US-16)
        // した後、このセッションだけ古いままAPIを呼んだ場合)。フロントエンドは401をUnauthorizedError
        // として扱いログイン画面に戻すため、404ではなくセッション破棄+401で返す
        logout_session();
        json_error('ログインが必要です', 401);
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
