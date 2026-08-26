<?php
// design.md §2.15参照。食事記録の日付・区分を後から直す。移動先に既に別の食事記録があれば
// (同じ日付・区分は1枚のカードにまとめる方針のため)エラーにし、ユーザーに選び直させる。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $id = require_int($body, 'id');
    $loggedDate = require_date($body, 'logged_date');
    $mealType = require_enum($body, 'meal_type', ['breakfast', 'lunch', 'dinner', 'snack']);

    $pdo = get_pdo();
    if (!find_meal($pdo, $userId, $id)) {
        json_error('食事記録が見つかりません', 404);
    }

    $existingMeal = find_meal_by_date_and_type($pdo, $userId, $loggedDate, $mealType);
    if ($existingMeal !== null && (int) $existingMeal['id'] !== $id) {
        json_error('その日付・区分の食事記録は既に存在します', 400);
    }

    update_meal($pdo, $userId, $id, $loggedDate, $mealType);

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
