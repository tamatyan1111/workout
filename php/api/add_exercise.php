<?php
// design.md §3.2参照。種目追加。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $name = require_field($body, 'name');
    $cycleId = require_int($body, 'cycle_id');
    $targetWeight = optional_number($body, 'target_weight');
    $targetReps = optional_int($body, 'target_reps');
    $targetSets = optional_int($body, 'target_sets');

    $pdo = get_pdo();
    // design.md §1.2: cycle_idが自分のサイクルであることを確認する(他人のサイクルへの追加を防ぐ)
    if (!find_cycle($pdo, $userId, $cycleId)) {
        json_error('サイクルが見つかりません', 404);
    }

    // design.md §2.4: (cycle_id, name)がユニーク。DBの制約に加えて分かりやすいエラーも返す
    $check = $pdo->prepare('SELECT 1 FROM exercises WHERE name = :name AND cycle_id = :cycle_id');
    $check->execute(['name' => $name, 'cycle_id' => $cycleId]);
    if ($check->fetchColumn()) {
        json_error('同じサイクルに同名の種目が既に存在します', 409);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO exercises (user_id, cycle_id, name, target_weight, target_reps, target_sets)
         VALUES (:user_id, :cycle_id, :name, :target_weight, :target_reps, :target_sets)'
    );
    $stmt->execute([
        'user_id' => $userId,
        'cycle_id' => $cycleId,
        'name' => $name,
        'target_weight' => $targetWeight,
        'target_reps' => $targetReps,
        'target_sets' => $targetSets,
    ]);

    json_ok(['id' => (int) $pdo->lastInsertId()]);
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
