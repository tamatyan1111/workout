<?php

// ==== 食品検索(全ユーザー共通マスタ + 独自食材) ====

// クエリを空白(全角スペース含む)で単語分割し、単語ごとのLIKE(AND条件)を追加する。
// 食品標準成分表の実データは「にわとり　［若どり・主品目］　むね　生」のように単語の間に
// 別の語が挟まることが多く、素朴に1つのLIKEにまとめると複数語検索がほぼヒットしなくなるため。
function add_name_search_conditions(string $q, string $paramPrefix, array &$conditions, array &$params): void
{
    $words = preg_split('/[\s\x{3000}]+/u', trim($q), -1, PREG_SPLIT_NO_EMPTY);
    foreach ($words as $i => $word) {
        $key = "{$paramPrefix}{$i}";
        $conditions[] = "name LIKE :{$key}";
        $params[$key] = '%' . $word . '%';
    }
}

function search_foods(PDO $pdo, int $userId, ?string $q, ?string $foodGroupCode, ?float $kcalMin, ?float $kcalMax): array
{
    $conditions = [];
    $params = [];
    if ($q !== null) {
        add_name_search_conditions($q, 'q', $conditions, $params);
    }
    if ($foodGroupCode !== null) {
        $conditions[] = 'food_group_code = :food_group_code';
        $params['food_group_code'] = $foodGroupCode;
    }
    if ($kcalMin !== null) {
        $conditions[] = 'kcal_per_100g >= :kcal_min';
        $params['kcal_min'] = $kcalMin;
    }
    if ($kcalMax !== null) {
        $conditions[] = 'kcal_per_100g <= :kcal_max';
        $params['kcal_max'] = $kcalMax;
    }
    $where = $conditions ? ('WHERE ' . implode(' AND ', $conditions)) : '';

    $stmt = $pdo->prepare(
        "SELECT id, food_group_code, food_group_name, name, kcal_per_100g, protein_g_per_100g, fat_g_per_100g, carb_g_per_100g
         FROM foods $where ORDER BY name LIMIT 100"
    );
    $stmt->execute($params);
    $masterFoods = array_map(function ($r) {
        return [
            'source' => 'master',
            'id' => (int) $r['id'],
            'food_group_code' => $r['food_group_code'],
            'food_group_name' => $r['food_group_name'],
            'name' => $r['name'],
            'kcal_per_100g' => (float) $r['kcal_per_100g'],
            'protein_g_per_100g' => $r['protein_g_per_100g'] !== null ? (float) $r['protein_g_per_100g'] : null,
            'fat_g_per_100g' => $r['fat_g_per_100g'] !== null ? (float) $r['fat_g_per_100g'] : null,
            'carb_g_per_100g' => $r['carb_g_per_100g'] !== null ? (float) $r['carb_g_per_100g'] : null,
        ];
    }, $stmt->fetchAll());

    // 独自食材は食品群を持たないため、food_group_code条件が指定されている場合は対象外にする
    $customFoods = [];
    if ($foodGroupCode === null) {
        $customConditions = ['user_id = :user_id'];
        $customParams = ['user_id' => $userId];
        if ($q !== null) {
            add_name_search_conditions($q, 'cq', $customConditions, $customParams);
        }
        if ($kcalMin !== null) {
            $customConditions[] = 'kcal_per_100g >= :kcal_min';
            $customParams['kcal_min'] = $kcalMin;
        }
        if ($kcalMax !== null) {
            $customConditions[] = 'kcal_per_100g <= :kcal_max';
            $customParams['kcal_max'] = $kcalMax;
        }
        $customWhere = implode(' AND ', $customConditions);
        $customStmt = $pdo->prepare(
            "SELECT id, name, kcal_per_100g, protein_g_per_100g, fat_g_per_100g, carb_g_per_100g
             FROM custom_foods WHERE $customWhere ORDER BY name LIMIT 100"
        );
        $customStmt->execute($customParams);
        $customFoods = array_map(function ($r) {
            return [
                'source' => 'custom',
                'id' => (int) $r['id'],
                'food_group_code' => null,
                'food_group_name' => null,
                'name' => $r['name'],
                'kcal_per_100g' => (float) $r['kcal_per_100g'],
                'protein_g_per_100g' => (float) $r['protein_g_per_100g'],
                'fat_g_per_100g' => (float) $r['fat_g_per_100g'],
                'carb_g_per_100g' => (float) $r['carb_g_per_100g'],
            ];
        }, $customStmt->fetchAll());
    }

    return array_merge($masterFoods, $customFoods);
}

// meal_items・recipe_items追加時に、指定された食品(全ユーザー共通マスタ or 自分の独自食材)の
// 現在の栄養値を取得する。custom_foodは呼び出し中のuser_idのものであることを検証する。
// foodsのprotein/fat/carbが「-」(未測定)でNULLの場合は0として扱う(スナップショット列はNOT NULLのため)。
// $eatingOutMealId指定時は、eating_out_meals(1食分の実値)をそのまま「100gあたり」の
// スナップショット値として返す。呼び出し側がquantity_gを常に100固定で渡すことで、
// per_100g × quantity_g / 100 という既存の計算式をそのまま使い回せる(design.md §2.20)。
// 戻り値の'shop_name'は外食由来のときだけ非nullになる(直近の履歴で「1行目=店名、2行目=料理名」
// のように分けて表示するため、'name'に結合しない。design.md §2.20)。
function resolve_food_source(PDO $pdo, int $userId, ?int $masterFoodId, ?int $customFoodId, ?int $eatingOutMealId = null): ?array
{
    if ($masterFoodId !== null) {
        $stmt = $pdo->prepare(
            'SELECT name, kcal_per_100g, protein_g_per_100g, fat_g_per_100g, carb_g_per_100g FROM foods WHERE id = :id'
        );
        $stmt->execute(['id' => $masterFoodId]);
    } elseif ($customFoodId !== null) {
        $stmt = $pdo->prepare(
            'SELECT name, kcal_per_100g, protein_g_per_100g, fat_g_per_100g, carb_g_per_100g FROM custom_foods
             WHERE id = :id AND user_id = :user_id'
        );
        $stmt->execute(['id' => $customFoodId, 'user_id' => $userId]);
    } else {
        $stmt = $pdo->prepare(
            'SELECT name, shop_name, kcal AS kcal_per_100g, protein_g AS protein_g_per_100g,
                    fat_g AS fat_g_per_100g, carb_g AS carb_g_per_100g
             FROM eating_out_meals WHERE id = :id AND user_id = :user_id'
        );
        $stmt->execute(['id' => $eatingOutMealId, 'user_id' => $userId]);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }
        return [
            'name' => $row['name'],
            'shop_name' => $row['shop_name'],
            'kcal_per_100g' => (float) $row['kcal_per_100g'],
            'protein_g_per_100g' => $row['protein_g_per_100g'] !== null ? (float) $row['protein_g_per_100g'] : 0.0,
            'fat_g_per_100g' => $row['fat_g_per_100g'] !== null ? (float) $row['fat_g_per_100g'] : 0.0,
            'carb_g_per_100g' => $row['carb_g_per_100g'] !== null ? (float) $row['carb_g_per_100g'] : 0.0,
        ];
    }
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    return [
        'name' => $row['name'],
        'shop_name' => null,
        'kcal_per_100g' => (float) $row['kcal_per_100g'],
        'protein_g_per_100g' => $row['protein_g_per_100g'] !== null ? (float) $row['protein_g_per_100g'] : 0.0,
        'fat_g_per_100g' => $row['fat_g_per_100g'] !== null ? (float) $row['fat_g_per_100g'] : 0.0,
        'carb_g_per_100g' => $row['carb_g_per_100g'] !== null ? (float) $row['carb_g_per_100g'] : 0.0,
    ];
}
