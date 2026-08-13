<?php
// design.md §2.6「秘密パスAPI」対応。記録削除。
require_once __DIR__ . '/../../private/bootstrap.php';
// require_once __DIR__ . '/../../private/auth.php'; require_auth(); // FUTURE

try {
    $body = read_json_body();
    $id = require_int($body, 'id');

    $pdo = get_pdo();
    $log = find_log($pdo, $id);
    if (!$log) {
        json_error('記録が見つかりません', 404);
    }

    $stmt = $pdo->prepare('DELETE FROM logs WHERE id = :id');
    $stmt->execute(['id' => $id]);

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
