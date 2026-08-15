<?php
// design.md §2.18参照。<img src="...">での直接読み込みを想定するGET。export.phpと同じ理由で
// (状態変更を伴わない通常のGETのため)CSRFヘッダーチェックは行わない。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);

try {
    $userId = require_login();
    $mealId = require_int($_GET, 'meal_id');

    $pdo = get_pdo();
    $meal = find_meal($pdo, $userId, $mealId);
    if (!$meal || $meal['photo_path'] === null) {
        json_error('写真が見つかりません', 404);
    }

    $fullPath = meal_photos_uploads_root() . '/' . $meal['photo_path'];
    if (!is_file($fullPath)) {
        json_error('写真が見つかりません', 404);
    }

    header('Content-Type: image/jpeg');
    header('Cache-Control: private, max-age=86400');
    header('Content-Length: ' . filesize($fullPath));
    readfile($fullPath);
    exit;
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
