<?php
// design.md §2.6「秘密パスAPI」対応。入力ページの編集/削除UI用。

require_once __DIR__ . '/../../private/bootstrap.php';

try {
    $limit = isset($_GET['limit']) && $_GET['limit'] !== '' ? (int) $_GET['limit'] : 20;
    $pdo = get_pdo();
    json_ok(['logs' => fetch_recent_logs($pdo, $limit)]);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
