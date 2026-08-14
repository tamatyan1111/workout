<?php
// design.md §2.10参照。既存の食事ログへの追加(カート追加操作)。
// {meal_id, master_food_id|custom_food_id, quantity_g} または {meal_id, recipe_id} を受け付ける。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

$pdo = null;

try {
    $userId = require_login();
    $body = read_json_body();
    $mealId = require_int($body, 'meal_id');
    $recipeId = optional_int($body, 'recipe_id');

    $pdo = get_pdo();
    if (!find_meal($pdo, $userId, $mealId)) {
        json_error('食事記録が見つかりません', 404);
    }

    // 単品追加の場合、bodyそのものを1件のitemとして扱う
    $rawItems = $recipeId === null ? [$body] : null;
    [$items, $batchId, $recipeName] = resolve_items_for_meal($pdo, $userId, $recipeId, $rawItems);

    // レシピ展開時は複数行のINSERTになるため、add_log.phpと同様にトランザクションで囲む
    $pdo->beginTransaction();
    $ids = insert_meal_items($pdo, $userId, $mealId, $items, $batchId, $recipeName);
    $pdo->commit();

    json_ok(['ids' => $ids]);
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
