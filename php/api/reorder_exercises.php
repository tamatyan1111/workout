<?php
// 種目管理画面でのドラッグ&ドロップ並べ替え(2026-08-26)。ドロップ後の並び順(id配列)を
// まとめて送り、queries.phpのreorder_exercisesで1回のトランザクションに反映する。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $orderedIds = require_field($body, 'ordered_ids');
    if (!is_array($orderedIds) || count($orderedIds) === 0) {
        json_error('ordered_idsは1件以上の配列で指定してください', 400);
    }
    foreach ($orderedIds as $id) {
        if (!is_numeric($id) || (int) $id != $id) {
            json_error('ordered_idsは整数の配列で指定してください', 400);
        }
    }
    $orderedIds = array_map('intval', $orderedIds);

    $pdo = get_pdo();
    $firstExercise = find_exercise($pdo, $userId, $orderedIds[0]);
    if (!$firstExercise) {
        json_error('種目が見つかりません', 404);
    }

    reorder_exercises($pdo, $userId, (int) $firstExercise['cycle_id'], (bool) $firstExercise['is_discontinued'], $orderedIds);

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
