<?php
// design.md §2.18参照。multipart/form-dataで受け取る(JSON POSTではないためread_json_body()は使わない)。
// 既に写真がある場合は差し替え(旧ファイルを削除)。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $mealId = require_int($_POST, 'meal_id');

    if (!isset($_FILES['photo']) || $_FILES['photo']['error'] !== UPLOAD_ERR_OK) {
        json_error('photoファイルが必要です', 400);
    }
    $tmpName = $_FILES['photo']['tmp_name'];
    if (!is_uploaded_file($tmpName)) {
        json_error('不正なアップロードです', 400);
    }

    $pdo = get_pdo();
    $meal = find_meal($pdo, $userId, $mealId);
    if (!$meal) {
        json_error('食事記録が見つかりません', 404);
    }

    $destDir = meal_photos_dir_for_user($userId);
    $filename = process_and_save_meal_photo($tmpName, (int) $_FILES['photo']['size'], $destDir);
    $relativePath = $userId . '/' . $filename;

    update_meal_photo($pdo, $mealId, $relativePath);
    delete_meal_photo_file($meal['photo_path']);

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
