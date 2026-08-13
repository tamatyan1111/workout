<?php
// 全エンドポイント共通のレスポンス形式。design.md §2.10参照。

// リクエスト元のOriginが許可リストに含まれる場合だけAccess-Control-Allow-Originを返す。
// 本番はダッシュボードとAPIが同一オリジンのため、このヘッダー自体は主にローカル開発用(design.md §1)。
// セッションCookieを使う認証系エンドポイントのためAllow-Credentialsも返す(originを特定済みの場合のみ安全)。
function send_cors_headers(array $config): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (in_array($origin, $config['public_cors_origins'], true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
    }
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');

    // ブラウザのプリフライト(OPTIONS)リクエストはボディ無しで即座に返す
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function send_json_headers(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
}

function json_ok($data = null): void
{
    send_json_headers();
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error(string $message, int $httpStatus = 400): void
{
    http_response_code($httpStatus);
    send_json_headers();
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

// 想定外の例外を捕まえて、詳細はサーバーログにだけ残し、クライアントには一般的なメッセージだけ返す
function handle_unexpected_error(Throwable $e): void
{
    error_log('[kintore] ' . $e->getMessage() . "\n" . $e->getTraceAsString());
    json_error('サーバーでエラーが発生しました', 500);
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        json_error('リクエストの形式が不正です', 400);
    }
    return $data;
}
