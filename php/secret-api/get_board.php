<?php
// design.md §2.6「秘密パスAPI」対応。入力ページの種目ドロップダウン・目標値編集一覧用。
require_once __DIR__ . '/../../private/bootstrap.php';

try {
    $pdo = get_pdo();
    json_ok(['exercises' => fetch_board($pdo)]);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
