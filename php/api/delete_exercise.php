<?php
// design.md §3.2参照。種目削除。記録が1件でも紐づく種目は削除不可
// (DBの外部キー制約 ON DELETE RESTRICT でも保護される)。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $id = require_int($body, 'id');

    $pdo = get_pdo();
    $exercise = find_exercise($pdo, $userId, $id);
    if (!$exercise) {
        json_error('種目が見つかりません', 404);
    }
    if (exercise_has_logs($pdo, $id)) {
        json_error('has_logs', 409);
    }

    $stmt = $pdo->prepare('DELETE FROM exercises WHERE id = :id');
    $stmt->execute(['id' => $id]);

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
