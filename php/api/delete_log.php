<?php
require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $id = require_int($body, 'id');

    $pdo = get_pdo();
    $log = find_log($pdo, $userId, $id);
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
