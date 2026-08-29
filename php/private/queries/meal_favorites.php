<?php

// ==== 食事を記録する画面の「よく使う内容」(meal_favorites) ====
// 2026-08-21、design.md未記載、UI再設計フェーズ2。「食品+量」の組み合わせをワンタップで
// カートに追加できるようにする(米150gのように毎回同じ量を使う食品を、毎回検索し直す
// 手間を無くすのが目的)。外食は外食管理自体がすでに同じ役割を持つため対象外。
// スナップショットは持たず、常に食品の最新の名前・栄養値をJOINで参照する。

function create_meal_favorite(PDO $pdo, int $userId, ?int $masterFoodId, ?int $customFoodId, float $quantityG): int
{
    $stmt = $pdo->prepare(
        'INSERT INTO meal_favorites (user_id, master_food_id, custom_food_id, quantity_g)
         VALUES (:user_id, :master_food_id, :custom_food_id, :quantity_g)'
    );
    $stmt->execute([
        'user_id' => $userId,
        'master_food_id' => $masterFoodId,
        'custom_food_id' => $customFoodId,
        'quantity_g' => $quantityG,
    ]);
    return (int) $pdo->lastInsertId();
}

function fetch_meal_favorites(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare(
        "SELECT mf.id, mf.master_food_id, mf.custom_food_id, mf.quantity_g,
                COALESCE(f.name, cf.name) AS name,
                COALESCE(f.kcal_per_100g, cf.kcal_per_100g) AS kcal_per_100g,
                COALESCE(f.protein_g_per_100g, cf.protein_g_per_100g) AS protein_g_per_100g,
                COALESCE(f.fat_g_per_100g, cf.fat_g_per_100g) AS fat_g_per_100g,
                COALESCE(f.carb_g_per_100g, cf.carb_g_per_100g) AS carb_g_per_100g
         FROM meal_favorites mf
         LEFT JOIN foods f ON f.id = mf.master_food_id
         LEFT JOIN custom_foods cf ON cf.id = mf.custom_food_id
         WHERE mf.user_id = :user_id
         ORDER BY mf.created_at DESC, mf.id DESC"
    );
    $stmt->execute(['user_id' => $userId]);
    return array_map(function ($r) {
        return [
            'id' => (int) $r['id'],
            'source' => $r['master_food_id'] !== null ? 'master' : 'custom',
            'food_id' => (int) ($r['master_food_id'] ?? $r['custom_food_id']),
            'name' => $r['name'],
            'quantity_g' => (float) $r['quantity_g'],
            'kcal_per_100g' => (float) $r['kcal_per_100g'],
            'protein_g_per_100g' => (float) $r['protein_g_per_100g'],
            'fat_g_per_100g' => (float) $r['fat_g_per_100g'],
            'carb_g_per_100g' => (float) $r['carb_g_per_100g'],
        ];
    }, $stmt->fetchAll());
}

function find_meal_favorite(PDO $pdo, int $userId, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT id FROM meal_favorites WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function delete_meal_favorite(PDO $pdo, int $id): void
{
    $stmt = $pdo->prepare('DELETE FROM meal_favorites WHERE id = :id');
    $stmt->execute(['id' => $id]);
}
