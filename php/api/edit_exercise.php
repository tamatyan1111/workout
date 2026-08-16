<?php
// design.md §3.2参照。種目名・サイクル・目標値・廃止フラグの編集。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $id = require_int($body, 'id');
    $name = require_field($body, 'name');
    $cycleId = require_int($body, 'cycle_id');
    $targetWeight = optional_number($body, 'target_weight');
    $targetReps = optional_int($body, 'target_reps');
    $targetSets = optional_int($body, 'target_sets');
    $discontinued = optional_bool($body, 'discontinued');

    $pdo = get_pdo();
    $exercise = find_exercise($pdo, $userId, $id);
    if (!$exercise) {
        json_error('種目が見つかりません', 404);
    }
    // design.md §1.2: cycle_idが自分のサイクルであることを確認する(他人のサイクルへの付け替えを防ぐ)
    if (!find_cycle($pdo, $userId, $cycleId)) {
        json_error('サイクルが見つかりません', 404);
    }

    // design.md §2.4: (cycle_id, name)がユニーク。DBの制約に加えて分かりやすいエラーも返す(自分自身は除外)
    $check = $pdo->prepare('SELECT 1 FROM exercises WHERE name = :name AND cycle_id = :cycle_id AND id != :id');
    $check->execute(['name' => $name, 'cycle_id' => $cycleId, 'id' => $id]);
    if ($check->fetchColumn()) {
        json_error('同じサイクルに同名の種目が既に存在します', 409);
    }

    $stmt = $pdo->prepare(
        'UPDATE exercises
         SET name = :name, cycle_id = :cycle_id, target_weight = :target_weight, target_reps = :target_reps,
             target_sets = :target_sets, is_discontinued = :is_discontinued
         WHERE id = :id'
    );
    $stmt->execute([
        'name' => $name,
        'cycle_id' => $cycleId,
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
