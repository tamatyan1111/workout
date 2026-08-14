<?php
// design.md §2.15参照。同じrecipe_batch_idを持つ行(1回のレシピ展開でまとめて追加された食材)を
// まとめて削除する。user_idで絞り込むため、他人のrecipe_batch_idを指定しても何も削除されない。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $recipeBatchId = require_field($body, 'recipe_batch_id');

    $pdo = get_pdo();
    $deletedCount = delete_meal_item_group($pdo, $userId, $recipeBatchId);
    if ($deletedCount === 0) {
        json_error('記録が見つかりません', 404);
    }

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
