<?php

// ==== 独自食材(custom_foods) ====

function fetch_custom_foods(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare(
        'SELECT id, name, kcal_per_100g, protein_g_per_100g, fat_g_per_100g, carb_g_per_100g
         FROM custom_foods WHERE user_id = :user_id ORDER BY name'
    );
    $stmt->execute(['user_id' => $userId]);
    return array_map(function ($r) {
        return [
            'id' => (int) $r['id'],
            'name' => $r['name'],
            'kcal_per_100g' => (float) $r['kcal_per_100g'],
            'protein_g_per_100g' => (float) $r['protein_g_per_100g'],
            'fat_g_per_100g' => (float) $r['fat_g_per_100g'],
            'carb_g_per_100g' => (float) $r['carb_g_per_100g'],
        ];
    }, $stmt->fetchAll());
}

function find_custom_food(PDO $pdo, int $userId, int $id): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, name, kcal_per_100g, protein_g_per_100g, fat_g_per_100g, carb_g_per_100g
         FROM custom_foods WHERE id = :id AND user_id = :user_id'
    );
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'kcal_per_100g' => (float) $row['kcal_per_100g'],
        'protein_g_per_100g' => (float) $row['protein_g_per_100g'],
        'fat_g_per_100g' => (float) $row['fat_g_per_100g'],
        'carb_g_per_100g' => (float) $row['carb_g_per_100g'],
    ];
}

function create_custom_food(
    PDO $pdo,
    int $userId,
    string $name,
    float $kcal,
    float $protein,
    float $fat,
    float $carb
): int {
    $stmt = $pdo->prepare(
        'INSERT INTO custom_foods (user_id, name, kcal_per_100g, protein_g_per_100g, fat_g_per_100g, carb_g_per_100g)
         VALUES (:user_id, :name, :kcal, :protein, :fat, :carb)'
    );
    $stmt->execute([
        'user_id' => $userId, 'name' => $name, 'kcal' => $kcal, 'protein' => $protein, 'fat' => $fat, 'carb' => $carb,
    ]);
    return (int) $pdo->lastInsertId();
}

function update_custom_food(PDO $pdo, int $id, string $name, float $kcal, float $protein, float $fat, float $carb): void
{
    $stmt = $pdo->prepare(
        'UPDATE custom_foods SET name = :name, kcal_per_100g = :kcal, protein_g_per_100g = :protein,
            fat_g_per_100g = :fat, carb_g_per_100g = :carb WHERE id = :id'
    );
    $stmt->execute(['name' => $name, 'kcal' => $kcal, 'protein' => $protein, 'fat' => $fat, 'carb' => $carb, 'id' => $id]);
}

// recipe_itemsからの参照(既定でON DELETE RESTRICT)が残っている独自食材は削除できない
function custom_food_in_use(PDO $pdo, int $id): bool
{
    $stmt = $pdo->prepare('SELECT 1 FROM recipe_items WHERE custom_food_id = :id LIMIT 1');
    $stmt->execute(['id' => $id]);
    return (bool) $stmt->fetchColumn();
}

function delete_custom_food(PDO $pdo, int $id): void
{
    $stmt = $pdo->prepare('DELETE FROM custom_foods WHERE id = :id');
    $stmt->execute(['id' => $id]);
}
