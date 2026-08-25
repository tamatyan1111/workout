<?php
// 種目管理画面での並べ替え(2026-08-21)。同じサイクル・同じ廃止状態の種目どうしでのみ
// 1つ上/下と順序を入れ替える(queries.phpのmove_exercise参照)。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $id = require_int($body, 'id');
    $direction = require_enum($body, 'direction', ['up', 'down']);

    $pdo = get_pdo();
    move_exercise($pdo, $userId, $id, $direction);

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
