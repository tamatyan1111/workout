<?php
// design.md §2.16・2.17参照。BMI・TDEE・目標カロリー・目標PFC・達成日超過/マイルストーンをまとめて返す。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);

try {
    $userId = require_login();
    $date = $_GET['date'] ?? null;
    $pdo = get_pdo();
    json_ok(build_nutrition_summary($pdo, $userId, $date ?: date('Y-m-d')));
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
