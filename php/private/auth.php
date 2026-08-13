<?php
// design.md §1.1「認証方式」対応。セッション管理・パスワードのハッシュ化・CSRF対策の共通ヘルパー。
// DBアクセスは行わない(ユーザー検索・ログイン失敗回数の記録等はqueries.php側の責務)。

function start_session(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        $https = ($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off';
        session_set_cookie_params([
            'httponly' => true,
            'secure' => $https,
            'samesite' => 'Lax',
        ]);
        session_start();
    }
}

function current_user_id(): ?int
{
    start_session();
    return isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null;
}

// ログイン必須のエンドポイント冒頭で呼ぶ。未ログインならJSONエラーを返して終了する。
function require_login(): int
{
    $userId = current_user_id();
    if ($userId === null) {
        json_error('ログインが必要です', 401);
    }
    return $userId;
}

// セッション固定化攻撃を避けるため、ログイン成功時は必ずセッションIDを再発行する
function login_as(int $userId): void
{
    start_session();
    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;
}

function logout_session(): void
{
    start_session();
    $_SESSION = [];
    session_destroy();
}

// design.md §1.1「CSRF対策」: 単純なクロスサイトフォーム送信では付与できないカスタムヘッダーを必須にする
function require_csrf_header(): void
{
    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'XMLHttpRequest') {
        json_error('不正なリクエストです', 403);
    }
}

function hash_password(string $password): string
{
    return password_hash($password, PASSWORD_BCRYPT);
}

function verify_password(string $password, string $hash): bool
{
    return password_verify($password, $hash);
}

// パスワードリセットトークン等に使う、推測困難なランダム文字列(URLセーフ)
function generate_random_token(): string
{
    return bin2hex(random_bytes(32));
}

function hash_token(string $token): string
{
    return hash('sha256', $token);
}
