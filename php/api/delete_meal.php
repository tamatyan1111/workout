<?php
// meal_itemsはON DELETE CASCADEで連動削除される(design.md §2.15)。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $id = require_int($body, 'id');

    $pdo = get_pdo();
    if (!find_meal($pdo, $userId, $id)) {
        json_error('食事記録が見つかりません', 404);
    }

    delete_meal($pdo, $id);
    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
