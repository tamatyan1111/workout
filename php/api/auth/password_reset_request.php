<?php
// design.md §2.10「認証API」対応。該当ユーザーの有無に関わらず同じレスポンスを返し、
// メール登録の有無を外部に漏らさない。

require_once __DIR__ . '/../../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $body = read_json_body();
    $email = require_email($body, 'email');

    $pdo = get_pdo();
    $user = find_user_by_email($pdo, $email);
    if ($user && $user['password_hash'] !== null) {
        $token = generate_random_token();
        $expiresAt = (new DateTimeImmutable('+1 hour'))->format('Y-m-d H:i:s');
        create_password_reset_token($pdo, (int) $user['id'], hash_token($token), $expiresAt);

        // design.md §3: ルート直下のクエリパラメータ方式にする(専用パスにすると、Service Worker
        // のSPAナビゲーションフォールバックを有効にする必要が生じ、/api/配下の通常ページ遷移
        // まで巻き込む事故につながるため。ルートは常に実ファイルのindex.htmlなので不要)
        $resetUrl = $config['app_base_url'] . '/?reset_token=' . urlencode($token);
        send_password_reset_email($config, $email, $resetUrl);
    }

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
