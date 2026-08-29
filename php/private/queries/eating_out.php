<?php

// ==== 外食(eating_out_meals) ====

// 店名の昇順、同じ店の中では料理名の昇順で並べる(2026-08-21、店名がバラバラの順で
// 出て探しにくいとの指摘を受けて変更)
function fetch_eating_out_meals(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare(
        'SELECT id, name, shop_name, kcal, protein_g, fat_g, carb_g FROM eating_out_meals
         WHERE user_id = :user_id ORDER BY shop_name, name'
    );
    $stmt->execute(['user_id' => $userId]);
    return array_map(function ($r) {
        return [
            'id' => (int) $r['id'],
            'name' => $r['name'],
            'shop_name' => $r['shop_name'],
            'kcal' => (float) $r['kcal'],
            'protein_g' => (float) $r['protein_g'],
            'fat_g' => (float) $r['fat_g'],
            'carb_g' => (float) $r['carb_g'],
        ];
    }, $stmt->fetchAll());
}

function find_eating_out_meal(PDO $pdo, int $userId, int $id): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, name, shop_name, kcal, protein_g, fat_g, carb_g FROM eating_out_meals
         WHERE id = :id AND user_id = :user_id'
    );
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'shop_name' => $row['shop_name'],
        'kcal' => (float) $row['kcal'],
        'protein_g' => (float) $row['protein_g'],
        'fat_g' => (float) $row['fat_g'],
        'carb_g' => (float) $row['carb_g'],
    ];
}

function create_eating_out_meal(
    PDO $pdo,
    int $userId,
    string $name,
    ?string $shopName,
    float $kcal,
    float $protein,
    float $fat,
    float $carb
): int {
    $stmt = $pdo->prepare(
        'INSERT INTO eating_out_meals (user_id, name, shop_name, kcal, protein_g, fat_g, carb_g)
         VALUES (:user_id, :name, :shop_name, :kcal, :protein, :fat, :carb)'
    );
    $stmt->execute([
        'user_id' => $userId, 'name' => $name, 'shop_name' => $shopName,
        'kcal' => $kcal, 'protein' => $protein, 'fat' => $fat, 'carb' => $carb,
    ]);
    return (int) $pdo->lastInsertId();
}

function update_eating_out_meal(
    PDO $pdo,
    int $id,
    string $name,
    ?string $shopName,
    float $kcal,
    float $protein,
    float $fat,
    float $carb
): void {
    $stmt = $pdo->prepare(
        'UPDATE eating_out_meals SET name = :name, shop_name = :shop_name, kcal = :kcal, protein_g = :protein,
            fat_g = :fat, carb_g = :carb WHERE id = :id'
    );
    $stmt->execute([
        'name' => $name, 'shop_name' => $shopName, 'kcal' => $kcal, 'protein' => $protein, 'fat' => $fat, 'carb' => $carb, 'id' => $id,
    ]);
}

function delete_eating_out_meal(PDO $pdo, int $id): void
{
    // meal_items.eating_out_meal_idはON DELETE SET NULLのため、custom_foodsと違い
    // 使用中チェックは不要(過去の記録はfood_name_snapshot等で既に自己完結している)
    $stmt = $pdo->prepare('DELETE FROM eating_out_meals WHERE id = :id');
    $stmt->execute(['id' => $id]);
}
