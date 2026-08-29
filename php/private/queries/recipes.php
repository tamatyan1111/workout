<?php

// ==== レシピ(recipes/recipe_items) ====

function fetch_recipes(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare(
        'SELECT id, name, share_token_hash IS NOT NULL AS is_shared FROM recipes WHERE user_id = :user_id ORDER BY name'
    );
    $stmt->execute(['user_id' => $userId]);
    $recipes = $stmt->fetchAll();
    if (count($recipes) === 0) {
        return [];
    }

    $itemsStmt = $pdo->prepare(
        'SELECT ri.recipe_id, ri.master_food_id, ri.custom_food_id, ri.quantity_g,
                COALESCE(f.name, cf.name) AS food_name
         FROM recipe_items ri
         LEFT JOIN foods f ON f.id = ri.master_food_id
         LEFT JOIN custom_foods cf ON cf.id = ri.custom_food_id
         WHERE ri.user_id = :user_id
         ORDER BY ri.id'
    );
    $itemsStmt->execute(['user_id' => $userId]);
    $itemsByRecipe = [];
    foreach ($itemsStmt->fetchAll() as $row) {
        $itemsByRecipe[(int) $row['recipe_id']][] = [
            'master_food_id' => $row['master_food_id'] !== null ? (int) $row['master_food_id'] : null,
            'custom_food_id' => $row['custom_food_id'] !== null ? (int) $row['custom_food_id'] : null,
            'food_name' => $row['food_name'],
            'quantity_g' => (float) $row['quantity_g'],
        ];
    }

    return array_map(function ($r) use ($itemsByRecipe) {
        return [
            'id' => (int) $r['id'],
            'name' => $r['name'],
            'is_shared' => (bool) $r['is_shared'],
            'items' => $itemsByRecipe[(int) $r['id']] ?? [],
        ];
    }, $recipes);
}

function find_recipe(PDO $pdo, int $userId, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT id, name FROM recipes WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

// design.md §2.19: レシピの共有リンク機能。生トークンはDBに残さず、SHA-256ハッシュのみ保存する
// (password_reset_tokensと同じ方針、generate_random_token/hash_tokenを再利用)。
// 有効化のたびに新しいトークンで上書きする(既存トークンを「返す」という選択肢は、生トークンを
// DBに残さない設計上そもそも存在しないため。結果として「再度共有」が暗黙のリンク再発行になる)
function enable_recipe_sharing(PDO $pdo, int $userId, int $recipeId): string
{
    $token = generate_random_token();
    $stmt = $pdo->prepare('UPDATE recipes SET share_token_hash = :hash WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['hash' => hash_token($token), 'id' => $recipeId, 'user_id' => $userId]);
    return $token;
}

function disable_recipe_sharing(PDO $pdo, int $userId, int $recipeId): void
{
    $stmt = $pdo->prepare('UPDATE recipes SET share_token_hash = NULL WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['id' => $recipeId, 'user_id' => $userId]);
}

// 共有リンクの公開閲覧ページ用。未ログインの閲覧者から呼ばれるため、current_user_idではなく
// トークンから引いたオーナーのuser_idを呼び出し側がexpand_recipe_items()に渡す
function find_recipe_by_share_token(PDO $pdo, string $tokenHash): ?array
{
    $stmt = $pdo->prepare('SELECT id, user_id, name FROM recipes WHERE share_token_hash = :hash');
    $stmt->execute(['hash' => $tokenHash]);
    $row = $stmt->fetch();
    return $row ?: null;
}

// $items: [['master_food_id' => ?int, 'custom_food_id' => ?int, 'quantity_g' => float], ...]
function insert_recipe_items(PDO $pdo, int $userId, int $recipeId, array $items): void
{
    $stmt = $pdo->prepare(
        'INSERT INTO recipe_items (recipe_id, user_id, master_food_id, custom_food_id, quantity_g)
         VALUES (:recipe_id, :user_id, :master_food_id, :custom_food_id, :quantity_g)'
    );
    foreach ($items as $item) {
        $stmt->execute([
            'recipe_id' => $recipeId,
            'user_id' => $userId,
            'master_food_id' => $item['master_food_id'],
            'custom_food_id' => $item['custom_food_id'],
            'quantity_g' => $item['quantity_g'],
        ]);
    }
}

function create_recipe(PDO $pdo, int $userId, string $name, array $items): int
{
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('INSERT INTO recipes (user_id, name) VALUES (:user_id, :name)');
        $stmt->execute(['user_id' => $userId, 'name' => $name]);
        $recipeId = (int) $pdo->lastInsertId();
        insert_recipe_items($pdo, $userId, $recipeId, $items);
        $pdo->commit();
        return $recipeId;
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function update_recipe(PDO $pdo, int $userId, int $recipeId, string $name, array $items): void
{
    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE recipes SET name = :name WHERE id = :id')->execute(['name' => $name, 'id' => $recipeId]);
        $pdo->prepare('DELETE FROM recipe_items WHERE recipe_id = :id')->execute(['id' => $recipeId]);
        insert_recipe_items($pdo, $userId, $recipeId, $items);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function delete_recipe(PDO $pdo, int $id): void
{
    // recipe_itemsはON DELETE CASCADEで連動削除される(design.md §2.14)
    $stmt = $pdo->prepare('DELETE FROM recipes WHERE id = :id');
    $stmt->execute(['id' => $id]);
}

// add_recipe.php・edit_recipe.php共通: レシピの構成食材配列をバリデーションしつつ、
// recipe_items用のitems配列を組み立てる。レシピはテンプレートなので栄養値のスナップショットは持たない(§2.14)。
function parse_recipe_items(PDO $pdo, int $userId, $rawItems): array
{
    if (!is_array($rawItems) || count($rawItems) === 0) {
        json_error('itemsは1件以上必要です', 400);
    }
    $items = [];
    foreach ($rawItems as $rawItem) {
        if (!is_array($rawItem)) {
            json_error('itemsの形式が不正です', 400);
        }
        $masterFoodId = optional_int($rawItem, 'master_food_id');
        $customFoodId = optional_int($rawItem, 'custom_food_id');
        if (($masterFoodId === null) === ($customFoodId === null)) {
            json_error('master_food_idかcustom_food_idのどちらか一方を指定してください', 400);
        }
        $quantity = require_positive_number($rawItem, 'quantity_g');
        if (resolve_food_source($pdo, $userId, $masterFoodId, $customFoodId) === null) {
            json_error('食品が見つかりません', 404);
        }
        $items[] = ['master_food_id' => $masterFoodId, 'custom_food_id' => $customFoodId, 'quantity_g' => $quantity];
    }
    return $items;
}
