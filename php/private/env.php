<?php
// .envファイル(KEY=VALUE形式、1行1変数)を読み込む小さなヘルパー。
// フレームワーク・外部ライブラリには依存しない(本番デプロイにvendor/を含めない方針のため)。

function load_env(string $path): array
{
    if (!file_exists($path)) {
        return [];
    }

    $vars = [];
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        [$key, $value] = array_pad(explode('=', $line, 2), 2, '');
        $vars[trim($key)] = trim($value);
    }
    return $vars;
}

// 実際のOS環境変数(CIで設定する想定)を優先し、無ければ .env ファイルを見る。
// これによりCI/テストは本番の .env(gitignore対象で本番の実際の認証情報が入っている)に
// 一切依存せずに動く。
function get_config(): array
{
    static $config = null;
    if ($config === null) {
        $envFile = load_env(__DIR__ . '/.env');
        $get = function (string $key, string $default = '') use ($envFile): string {
            $fromEnv = getenv($key);
            return $fromEnv !== false ? $fromEnv : ($envFile[$key] ?? $default);
        };

        $config = [
            'db_host' => $get('DB_HOST', 'localhost'),
            'db_name' => $get('DB_NAME'),
            'db_user' => $get('DB_USER'),
            'db_pass' => $get('DB_PASS'),
            'public_cors_origins' => array_values(array_filter(array_map(
                'trim',
                explode(',', $get('PUBLIC_CORS_ORIGINS'))
            ))),
            'app_base_url' => rtrim($get('APP_BASE_URL', 'http://localhost:5173'), '/'),
            'google_client_id' => $get('GOOGLE_CLIENT_ID'),
            'google_client_secret' => $get('GOOGLE_CLIENT_SECRET'),
            'google_redirect_uri' => $get('GOOGLE_REDIRECT_URI'),
            'mail_from' => $get('MAIL_FROM', 'noreply@example.com'),
        ];
    }
    return $config;
}
