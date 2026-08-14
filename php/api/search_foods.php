<?php
// design.md §2.12参照。全ユーザー共通マスタ(foods)と自分の独自食材(custom_foods)を横断検索する。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);

try {
    $userId = require_login();
    $q = ($_GET['q'] ?? '') !== '' ? $_GET['q'] : null;
    $foodGroupCode = ($_GET['food_group_code'] ?? '') !== '' ? $_GET['food_group_code'] : null;
    $kcalMin = isset($_GET['kcal_min']) && $_GET['kcal_min'] !== '' && is_numeric($_GET['kcal_min'])
        ? (float) $_GET['kcal_min'] : null;
    $kcalMax = isset($_GET['kcal_max']) && $_GET['kcal_max'] !== '' && is_numeric($_GET['kcal_max'])
        ? (float) $_GET['kcal_max'] : null;

    $pdo = get_pdo();
    json_ok(['foods' => search_foods($pdo, $userId, $q, $foodGroupCode, $kcalMin, $kcalMax)]);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
