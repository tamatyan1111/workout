<?php

// ==== 食事ログ(meals/meal_items) ====

// $limitを指定すると、直近(logged_date, id 降順)の$limit件だけを日付昇順で返す
// (「最近の記録」用。実績グラフの期間指定とは独立して使う)
function fetch_meals(PDO $pdo, int $userId, ?string $dateFrom, ?string $dateTo, ?int $limit = null): array
{
    $sql = 'SELECT id, logged_date, meal_type, photo_path FROM meals WHERE user_id = :user_id';
    $params = ['user_id' => $userId];
    if ($dateFrom !== null) {
        $sql .= ' AND logged_date >= :date_from';
        $params['date_from'] = $dateFrom;
    }
    if ($dateTo !== null) {
        $sql .= ' AND logged_date <= :date_to';
        $params['date_to'] = $dateTo;
    }
    if ($limit !== null) {
        $sql .= ' ORDER BY logged_date DESC, id DESC LIMIT :limit';
    } else {
        $sql .= ' ORDER BY logged_date, id';
    }
    $stmt = $pdo->prepare($sql);
    if ($limit !== null) {
        foreach ($params as $key => $value) {
            $stmt->bindValue(':' . $key, $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
    } else {
        $stmt->execute($params);
    }
    $meals = $limit !== null ? array_reverse($stmt->fetchAll()) : $stmt->fetchAll();
    if (count($meals) === 0) {
        return [];
    }

    // 2026-08-26: カロリー・栄養・食品名・店名は、食材/外食が編集された後は常に最新の値で
    // 参照したいという要望を受けて、スナップショット列ではなく食品側をLEFT JOINしてCOALESCEで
    // 優先的に参照するように変更した(参照先の食品が削除された場合だけスナップショットへ
    // フォールバックする)。レシピ名(recipe_name_snapshot)はmeal_itemsにrecipe_idを持たず
    // 遡って参照できないため、こちらは引き続きスナップショットのまま。
    $itemsStmt = $pdo->prepare(
        'SELECT mi.id, mi.meal_id, mi.master_food_id, mi.custom_food_id, mi.eating_out_meal_id,
                COALESCE(f.name, cf.name, mi.food_name_snapshot) AS food_name,
                COALESCE(f.kcal_per_100g, cf.kcal_per_100g, eom.kcal, mi.kcal_per_100g_snapshot) AS kcal_per_100g,
                COALESCE(f.protein_g_per_100g, cf.protein_g_per_100g, eom.protein_g, mi.protein_g_per_100g_snapshot) AS protein_g_per_100g,
                COALESCE(f.fat_g_per_100g, cf.fat_g_per_100g, eom.fat_g, mi.fat_g_per_100g_snapshot) AS fat_g_per_100g,
                COALESCE(f.carb_g_per_100g, cf.carb_g_per_100g, eom.carb_g, mi.carb_g_per_100g_snapshot) AS carb_g_per_100g,
                mi.quantity_g, mi.recipe_batch_id, mi.recipe_name_snapshot,
                COALESCE(eom.shop_name, mi.eating_out_shop_name_snapshot) AS eating_out_shop_name
         FROM meal_items mi
         LEFT JOIN foods f ON f.id = mi.master_food_id
         LEFT JOIN custom_foods cf ON cf.id = mi.custom_food_id
         LEFT JOIN eating_out_meals eom ON eom.id = mi.eating_out_meal_id
         WHERE mi.user_id = :user_id ORDER BY mi.id'
    );
    $itemsStmt->execute(['user_id' => $userId]);
    $itemsByMeal = [];
    foreach ($itemsStmt->fetchAll() as $row) {
        $itemsByMeal[(int) $row['meal_id']][] = [
            'id' => (int) $row['id'],
            'master_food_id' => $row['master_food_id'] !== null ? (int) $row['master_food_id'] : null,
            'custom_food_id' => $row['custom_food_id'] !== null ? (int) $row['custom_food_id'] : null,
            'eating_out_meal_id' => $row['eating_out_meal_id'] !== null ? (int) $row['eating_out_meal_id'] : null,
            'food_name' => $row['food_name'],
            'kcal_per_100g' => (float) $row['kcal_per_100g'],
            'protein_g_per_100g' => (float) $row['protein_g_per_100g'],
            'fat_g_per_100g' => (float) $row['fat_g_per_100g'],
            'carb_g_per_100g' => (float) $row['carb_g_per_100g'],
            'quantity_g' => (float) $row['quantity_g'],
            'recipe_batch_id' => $row['recipe_batch_id'],
            'recipe_name' => $row['recipe_name_snapshot'],
            'eating_out_shop_name' => $row['eating_out_shop_name'],
        ];
    }

    return array_map(function ($m) use ($itemsByMeal) {
        return [
            'id' => (int) $m['id'],
            'logged_date' => $m['logged_date'],
            'meal_type' => $m['meal_type'],
            'photo_path' => $m['photo_path'],
            'items' => $itemsByMeal[(int) $m['id']] ?? [],
        ];
    }, $meals);
}

function find_meal(PDO $pdo, int $userId, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT id, photo_path FROM meals WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

// 2026-08-18追加: 同じ日付・区分の食事は1枚のカードにまとめたいというUI要望のため、
// add_meal.php はこの関数で既存の食事を探し、無ければ新規作成する(design.md §2.15)
function find_meal_by_date_and_type(PDO $pdo, int $userId, string $loggedDate, string $mealType): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, photo_path FROM meals WHERE user_id = :user_id AND logged_date = :logged_date AND meal_type = :meal_type'
    );
    $stmt->execute(['user_id' => $userId, 'logged_date' => $loggedDate, 'meal_type' => $mealType]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function update_meal(PDO $pdo, int $userId, int $id, string $loggedDate, string $mealType): void
{
    $stmt = $pdo->prepare('UPDATE meals SET logged_date = :logged_date, meal_type = :meal_type WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['logged_date' => $loggedDate, 'meal_type' => $mealType, 'id' => $id, 'user_id' => $userId]);
}

// 2026-08-15追加(§2.18): 写真の添付・差し替え・削除。$photoPathはmeal_photos/{user_id}/{uuid}.jpg
// のような相対パス、削除時はnullを渡す。呼び出し側で古いファイルの削除を行う(この関数はDB更新のみ)。
function update_meal_photo(PDO $pdo, int $mealId, ?string $photoPath): void
{
    $stmt = $pdo->prepare('UPDATE meals SET photo_path = :photo_path WHERE id = :id');
    $stmt->execute(['photo_path' => $photoPath, 'id' => $mealId]);
}

function create_meal(PDO $pdo, int $userId, string $loggedDate, string $mealType, ?string $photoPath): int
{
    $stmt = $pdo->prepare(
        'INSERT INTO meals (user_id, logged_date, meal_type, photo_path)
         VALUES (:user_id, :logged_date, :meal_type, :photo_path)'
    );
    $stmt->execute([
        'user_id' => $userId, 'logged_date' => $loggedDate, 'meal_type' => $mealType, 'photo_path' => $photoPath,
    ]);
    return (int) $pdo->lastInsertId();
}

// design.md §2.15: 追加した瞬間の栄養値をスナップショットする。
// $items: [['master_food_id' => ?int, 'custom_food_id' => ?int, 'eating_out_meal_id' => ?int,
//           'quantity_g' => float, 'food' => resolve_food_source()の戻り値], ...]
function insert_meal_items(
    PDO $pdo,
    int $userId,
    int $mealId,
    array $items,
    ?string $recipeBatchId,
    ?string $recipeNameSnapshot
): array {
    $stmt = $pdo->prepare(
        'INSERT INTO meal_items
            (meal_id, user_id, master_food_id, custom_food_id, eating_out_meal_id, food_name_snapshot,
             kcal_per_100g_snapshot, protein_g_per_100g_snapshot, fat_g_per_100g_snapshot, carb_g_per_100g_snapshot,
             quantity_g, recipe_batch_id, recipe_name_snapshot, eating_out_shop_name_snapshot)
         VALUES
            (:meal_id, :user_id, :master_food_id, :custom_food_id, :eating_out_meal_id, :food_name_snapshot,
             :kcal, :protein, :fat, :carb, :quantity_g, :recipe_batch_id, :recipe_name_snapshot, :eating_out_shop_name_snapshot)'
    );
    $ids = [];
    foreach ($items as $item) {
        $stmt->execute([
            'meal_id' => $mealId,
            'user_id' => $userId,
            'master_food_id' => $item['master_food_id'],
            'custom_food_id' => $item['custom_food_id'],
            'eating_out_meal_id' => $item['eating_out_meal_id'],
            'food_name_snapshot' => $item['food']['name'],
            'kcal' => $item['food']['kcal_per_100g'],
            'protein' => $item['food']['protein_g_per_100g'],
            'fat' => $item['food']['fat_g_per_100g'],
            'carb' => $item['food']['carb_g_per_100g'],
            'quantity_g' => $item['quantity_g'],
            'recipe_batch_id' => $recipeBatchId,
            'recipe_name_snapshot' => $recipeNameSnapshot,
            'eating_out_shop_name_snapshot' => $item['food']['shop_name'] ?? null,
        ]);
        $ids[] = (int) $pdo->lastInsertId();
    }
    return $ids;
}

// レシピを構成食材まで展開し、insert_meal_items()にそのまま渡せるitems配列を組み立てる(design.md §2.15)
function expand_recipe_items(PDO $pdo, int $userId, int $recipeId): array
{
    $stmt = $pdo->prepare('SELECT master_food_id, custom_food_id, quantity_g FROM recipe_items WHERE recipe_id = :recipe_id');
    $stmt->execute(['recipe_id' => $recipeId]);
    $items = [];
    foreach ($stmt->fetchAll() as $row) {
        $masterFoodId = $row['master_food_id'] !== null ? (int) $row['master_food_id'] : null;
        $customFoodId = $row['custom_food_id'] !== null ? (int) $row['custom_food_id'] : null;
        $food = resolve_food_source($pdo, $userId, $masterFoodId, $customFoodId);
        if ($food === null) {
            continue; // 参照先が削除済み(通常は起こらないが念のため)
        }
        $items[] = [
            'master_food_id' => $masterFoodId,
            'custom_food_id' => $customFoodId,
            'eating_out_meal_id' => null, // レシピの構成食材は材料が分かるものに限るため、外食は使わない
            'quantity_g' => (float) $row['quantity_g'],
            'food' => $food,
        ];
    }
    return $items;
}

// add_meal.php・add_meal_item.php共通: レシピ指定 or 生の食材配列から、insert_meal_items()用のitems配列と、
// レシピ経由の場合のグループID・レシピ名を組み立てる。戻り値: [items, recipeBatchId, recipeNameSnapshot]
function resolve_items_for_meal(PDO $pdo, int $userId, ?int $recipeId, $rawItems): array
{
    if ($recipeId !== null) {
        $recipe = find_recipe($pdo, $userId, $recipeId);
        if (!$recipe) {
            json_error('レシピが見つかりません', 404);
        }
        $items = expand_recipe_items($pdo, $userId, $recipeId);
        if (count($items) === 0) {
            json_error('レシピに食材が登録されていません', 400);
        }
        return [$items, generate_uuid_v4(), $recipe['name']];
    }

    if (!is_array($rawItems) || count($rawItems) === 0) {
        json_error('itemsまたはrecipe_idのいずれかが必要です', 400);
    }
    $items = [];
    foreach ($rawItems as $rawItem) {
        if (!is_array($rawItem)) {
            json_error('itemsの形式が不正です', 400);
        }
        $masterFoodId = optional_int($rawItem, 'master_food_id');
        $customFoodId = optional_int($rawItem, 'custom_food_id');
        $eatingOutMealId = optional_int($rawItem, 'eating_out_meal_id');
        if (count(array_filter([$masterFoodId, $customFoodId, $eatingOutMealId], fn ($v) => $v !== null)) !== 1) {
            json_error('master_food_id・custom_food_id・eating_out_meal_idのいずれか1つだけを指定してください', 400);
        }
        $quantity = require_positive_number($rawItem, 'quantity_g');
        $food = resolve_food_source($pdo, $userId, $masterFoodId, $customFoodId, $eatingOutMealId);
        if ($food === null) {
            json_error('食品が見つかりません', 404);
        }
        $items[] = [
            'master_food_id' => $masterFoodId,
            'custom_food_id' => $customFoodId,
            'eating_out_meal_id' => $eatingOutMealId,
            'quantity_g' => $quantity,
            'food' => $food,
        ];
    }
    return [$items, null, null];
}

function find_meal_item(PDO $pdo, int $userId, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT id FROM meal_items WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

// 2026-08-15追加(design.md §2.15): 食材・分量を後から直す。resolve_items_for_meal()と同じ
// resolve_food_source()で食品を解決し直し、*_snapshot列をUPDATEで上書きする(INSERTではなく
// UPDATE対象に使うだけで、追加時と同じ食品解決ロジックを再利用できる)。meal_id・recipe_batch_idは
// 変更しない(食材の中身と分量だけを直す操作とし、どの食事・どのレシピ由来かという所属は動かさない)。
function update_meal_item(PDO $pdo, int $userId, int $id, ?int $masterFoodId, ?int $customFoodId, float $quantityG): void
{
    $food = resolve_food_source($pdo, $userId, $masterFoodId, $customFoodId);
    if ($food === null) {
        json_error('食品が見つかりません', 404);
    }

    $stmt = $pdo->prepare(
        'UPDATE meal_items SET
            master_food_id = :master_food_id,
            custom_food_id = :custom_food_id,
            food_name_snapshot = :food_name_snapshot,
            kcal_per_100g_snapshot = :kcal,
            protein_g_per_100g_snapshot = :protein,
            fat_g_per_100g_snapshot = :fat,
            carb_g_per_100g_snapshot = :carb,
            quantity_g = :quantity_g
         WHERE id = :id'
    );
    $stmt->execute([
        'master_food_id' => $masterFoodId,
        'custom_food_id' => $customFoodId,
        'food_name_snapshot' => $food['name'],
        'kcal' => $food['kcal_per_100g'],
        'protein' => $food['protein_g_per_100g'],
        'fat' => $food['fat_g_per_100g'],
        'carb' => $food['carb_g_per_100g'],
        'quantity_g' => $quantityG,
        'id' => $id,
    ]);
}

function delete_meal_item(PDO $pdo, int $id): void
{
    $stmt = $pdo->prepare('DELETE FROM meal_items WHERE id = :id');
    $stmt->execute(['id' => $id]);
}

// design.md §2.15: 同じrecipe_batch_idを持つ行をまとめて削除する
function delete_meal_item_group(PDO $pdo, int $userId, string $recipeBatchId): int
{
    $stmt = $pdo->prepare('DELETE FROM meal_items WHERE recipe_batch_id = :batch_id AND user_id = :user_id');
    $stmt->execute(['batch_id' => $recipeBatchId, 'user_id' => $userId]);
    return $stmt->rowCount();
}

function delete_meal(PDO $pdo, int $id): void
{
    // meal_itemsはON DELETE CASCADEで連動削除される(design.md §2.15)
    $stmt = $pdo->prepare('DELETE FROM meals WHERE id = :id');
    $stmt->execute(['id' => $id]);
}
