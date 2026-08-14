<?php
// ローカル開発専用のルーター。PHP組み込みサーバーに渡すと、ダッシュボード(ビルド済み静的ファイル)と
// APIを同一オリジンから配信できる(README.md「ローカル開発」参照)。docrootを
// apps/dashboard/dist に指定して起動すること。
//
// 使い方(プロジェクトルートで実行):
//   npm run build --workspace=apps/dashboard
//   php -S localhost:8000 -t apps/dashboard/dist dev/router.php
//
// /api/配下はphp/api/の実ファイルをrequireし、それ以外は組み込みサーバーの標準の
// 静的ファイル配信(docroot=apps/dashboard/dist)に任せる。

$projectRoot = dirname(__DIR__);
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

if (strpos($uri, '/api/') === 0) {
    $file = $projectRoot . '/php' . $uri;
    if (is_file($file)) {
        chdir(dirname($file));
        require $file;
        return true;
    }
    http_response_code(404);
    echo 'Not found: ' . $uri;
    return true;
}

return false; // 組み込みサーバーがdocroot(apps/dashboard/dist)からそのまま配信する
