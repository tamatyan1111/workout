<?php
// design.md §2.15参照。items(生の食材配列)かrecipe_idのどちらかを指定する。
// レシピ指定時はサーバー側でrecipe_itemsを展開し、meal_itemsへ栄養値をスナップショット保存する。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

$pdo = null;

try {
    $userId = require_login();
    $body = read_json_body();
    $loggedDate = require_date($body, 'logged_date');
    $mealType = require_enum($body, 'meal_type', ['breakfast', 'lunch', 'dinner', 'snack']);
    $recipeId = optional_int($body, 'recipe_id');

    $pdo = get_pdo();
    [$items, $batchId, $recipeName] = resolve_items_for_meal($pdo, $userId, $recipeId, $body['items'] ?? null);

    $pdo->beginTransaction();
    $mealId = create_meal($pdo, $userId, $loggedDate, $mealType, null);
    $ids = insert_meal_items($pdo, $userId, $mealId, $items, $batchId, $recipeName);
    $pdo->commit();

    json_ok(['id' => $mealId, 'item_ids' => $ids]);
} catch (ValidationException $e) {
    if ($pdo !== null && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    if ($pdo !== null && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    handle_unexpected_error($e);
}
