<?php
// design.md §2.10対応。get_boardは種目が1件もないサイクルを返さないため
// (exercises JOIN cyclesのため)、サイクル管理画面・種目追加フォーム用に別途一覧取得を用意する。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);

try {
    $userId = require_login();
    $pdo = get_pdo();
    json_ok(['cycles' => fetch_cycles($pdo, $userId)]);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
