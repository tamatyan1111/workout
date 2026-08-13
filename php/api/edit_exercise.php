<?php
// design.md §3.2参照。目標値・廃止フラグの編集。種目名・サイクルはここでは変更できない。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $id = require_int($body, 'id');
    $targetWeight = optional_number($body, 'target_weight');
    $targetReps = optional_int($body, 'target_reps');
    $targetSets = optional_int($body, 'target_sets');
    $discontinued = optional_bool($body, 'discontinued');

    $pdo = get_pdo();
    $exercise = find_exercise($pdo, $userId, $id);
    if (!$exercise) {
        json_error('種目が見つかりません', 404);
    }

    $stmt = $pdo->prepare(
        'UPDATE exercises
         SET target_weight = :target_weight, target_reps = :target_reps,
             target_sets = :target_sets, is_discontinued = :is_discontinued
         WHERE id = :id'
    );
    $stmt->execute([
        'target_weight' => $targetWeight,
        'target_reps' => $targetReps,
        'target_sets' => $targetSets,
        'is_discontinued' => $discontinued ? 1 : 0,
        'id' => $id,
    ]);

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
