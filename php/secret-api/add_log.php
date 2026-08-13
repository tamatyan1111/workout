<?php
// design.md §2.6「秘密パスAPI」対応。記録追加。
require_once __DIR__ . '/../../private/bootstrap.php';
// require_once __DIR__ . '/../../private/auth.php'; require_auth(); // FUTURE: ログイン機能を追加したらここで有効化

$pdo = null;

try {
    $body = read_json_body();
    $exerciseId = require_int($body, 'exercise_id');
    $loggedDate = require_date($body, 'logged_date');
    $sets = $body['sets'] ?? null;
    if (!is_array($sets) || count($sets) === 0) {
        json_error('setsは1件以上必要です', 400);
    }

    $pdo = get_pdo();
    $exercise = find_exercise($pdo, $exerciseId);
    if (!$exercise) {
        json_error('種目が見つかりません', 404);
    }
    $weightless = is_weightless($pdo, $exerciseId);

    // 事前に全セットをバリデーション(1件でも不正ならDBに何も書き込まない)
    $parsedSets = [];
    foreach ($sets as $set) {
        if (!is_array($set) || !array_key_exists('reps', $set) || $set['reps'] === null || $set['reps'] === '') {
            json_error('回数は必須です', 400);
        }
        if (!is_numeric($set['reps'])) {
            json_error('回数は数値で指定してください', 400);
        }
        $weight = $set['weight'] ?? null;
        if (!$weightless && ($weight === null || $weight === '')) {
            json_error('重量は必須です', 400);
        }
        if ($weight !== null && $weight !== '' && !is_numeric($weight)) {
            json_error('重量は数値で指定してください', 400);
        }
        $parsedSets[] = [
            'weight' => $weightless ? null : (float) $weight,
            'reps' => (int) $set['reps'],
        ];
    }

    $pdo->beginTransaction();
    $stmt = $pdo->prepare(
        'INSERT INTO logs (exercise_id, logged_date, set_number, weight, reps) VALUES (:exercise_id, :logged_date, :set_number, :weight, :reps)'
    );
    $ids = [];
    foreach ($parsedSets as $i => $set) {
        $stmt->execute([
            'exercise_id' => $exerciseId,
            'logged_date' => $loggedDate,
            'set_number' => $i + 1,
            'weight' => $set['weight'],
            'reps' => $set['reps'],
        ]);
        $ids[] = (int) $pdo->lastInsertId();
    }
    $pdo->commit();

    // design.md §2.6: setsと同じ順序で採番されたIDを返す
    json_ok(['ids' => $ids]);
} catch (ValidationException $e) {
    if ($pdo !== null && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    if ($pdo !== null && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    handle_unexpected_error($e);
}
