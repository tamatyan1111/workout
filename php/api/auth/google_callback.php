<?php
// design.md §1.1「Googleログイン」対応。認可コードをアクセストークンに交換し、
// userinfoエンドポイントから取得したsub/emailでユーザーを検索・作成してログインさせる。
// ブラウザの通常ナビゲーションで到達するエンドポイントのため、失敗時もJSONではなく
// ダッシュボードへのリダイレクト(エラークエリ付き)で返す。

require_once __DIR__ . '/../../private/bootstrap.php';

$config = get_config();

start_session();
$expectedState = $_SESSION['google_oauth_state'] ?? null;
unset($_SESSION['google_oauth_state']);

$code = $_GET['code'] ?? null;
$state = $_GET['state'] ?? null;
if (!is_string($code) || !is_string($state) || $expectedState === null || !hash_equals($expectedState, $state)) {
    redirect_with_google_error($config['app_base_url']);
}

try {
    $accessToken = google_exchange_code_for_token($config, $code);
    $userinfo = google_fetch_userinfo($accessToken);

    $pdo = get_pdo();
    $user = find_user_by_google_sub($pdo, $userinfo['sub']);

    // design.md §2.1: google_subで見つからない場合、Google側で確認済み(email_verified)の
    // メールアドレスに限り、既存のメール/パスワードアカウントを検索して紐づける。
    // 紐づけないと、同じメールアドレスで新規作成しようとしてusers.emailのUNIQUE制約に違反する。
    $existingByEmail = null;
    if (!$user && $userinfo['email'] !== null && $userinfo['email_verified']) {
        $existingByEmail = find_user_by_email($pdo, $userinfo['email']);
    }

    if ($user) {
        $userId = (int) $user['id'];
    } elseif ($existingByEmail) {
        $userId = (int) $existingByEmail['id'];
        link_google_to_user($pdo, $userId, $userinfo['sub']);
    } else {
        $displayName = $userinfo['email'] !== null ? explode('@', $userinfo['email'])[0] : 'ユーザー';
        $userId = create_user_with_google($pdo, $userinfo['sub'], $userinfo['email'], $displayName);
    }

    login_as($userId);
    header('Location: ' . $config['app_base_url'] . '/');
    exit;
} catch (Throwable $e) {
    error_log('[kintore] ' . $e->getMessage() . "\n" . $e->getTraceAsString());
    redirect_with_google_error($config['app_base_url']);
}
