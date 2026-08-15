<?php
// design.md §2.19: レシピの共有リンク経由の閲覧。意図的にログイン不要
// (レシピのオーナーではなく任意の第三者がアクセスする、パスワードリセットリンクと同じ
// 「推測困難なトークンを知っている者だけがアクセスできる」設計)。状態変更を伴わない
// 通常のGETのため、CSRFヘッダーチェックは行わない(get_meal_photo.phpと同じ理由)。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);

try {
    $token = require_field($_GET, 'token');

    $pdo = get_pdo();
    $recipe = find_recipe_by_share_token($pdo, hash_token($token));
    if (!$recipe) {
        json_error('レシピが見つかりません', 404);
    }

    $items = expand_recipe_items($pdo, (int) $recipe['user_id'], (int) $recipe['id']);

    json_ok(['name' => $recipe['name'], 'items' => $items]);
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
