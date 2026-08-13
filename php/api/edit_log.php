<?php
require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $id = require_int($body, 'id');
    $loggedDate = require_date($body, 'logged_date');
    $reps = require_field($body, 'reps');
    if (!is_numeric($reps)) {
        json_error('回数は数値で指定してください', 400);
    }

    $pdo = get_pdo();
    $log = find_log($pdo, $userId, $id);
    if (!$log) {
        json_error('記録が見つかりません', 404);
    }

    // design.md §2.8: add_log.phpと同様、種目が重量あり種目なら重量を必須にする
    $weightless = is_weightless($pdo, (int) $log['exercise_id']);
    $weight = optional_number($body, 'weight');
    if (!$weightless && $weight === null) {
        json_error('重量は必須です', 400);
    }
    if ($weightless) {
        $weight = null;
    }

    $stmt = $pdo->prepare(
        'UPDATE logs SET logged_date = :logged_date, weight = :weight, reps = :reps WHERE id = :id'
    );
    $stmt->execute([
        'logged_date' => $loggedDate,
        'weight' => $weight,
        'reps' => (int) $reps,
        'id' => $id,
    ]);

    json_ok();
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
