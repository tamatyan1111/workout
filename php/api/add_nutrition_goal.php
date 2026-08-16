<?php
// design.md §2.11参照。目標を設定するたびに新しい行をINSERTする(履歴として残す。is_activeのようなフラグは持たない)。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    $userId = require_login();
    $body = read_json_body();
    $targetWeight = require_positive_number($body, 'target_weight');
    $targetBodyFatPercentage = optional_number($body, 'target_body_fat_percentage');
    $targetDate = require_date($body, 'target_date');
    $pfcMode = require_enum($body, 'pfc_mode', ['standard', 'bulk', 'cut', 'custom', 'custom_ratio']);

    $customProteinG = null;
    $customFatG = null;
    $customCarbG = null;
    if ($pfcMode === 'custom') {
        $customProteinG = require_non_negative_number($body, 'custom_protein_g');
        $customFatG = require_non_negative_number($body, 'custom_fat_g');
        $customCarbG = require_non_negative_number($body, 'custom_carb_g');
    }

    $customProteinPercent = null;
    $customFatPercent = null;
    $customCarbPercent = null;
    if ($pfcMode === 'custom_ratio') {
        $customProteinPercent = require_non_negative_number($body, 'custom_protein_percent');
        $customFatPercent = require_non_negative_number($body, 'custom_fat_percent');
        $customCarbPercent = require_non_negative_number($body, 'custom_carb_percent');
        $sum = $customProteinPercent + $customFatPercent + $customCarbPercent;
        if (abs($sum - 100.0) > 0.5) {
            json_error('タンパク質・脂質・炭水化物の比率の合計が100%になるようにしてください(現在の合計: ' . round($sum, 1) . '%)', 400);
        }
    }

    $pdo = get_pdo();
    $id = create_nutrition_goal(
        $pdo,
        $userId,
        $targetWeight,
        $targetDate,
        $pfcMode,
        $customProteinG,
        $customFatG,
        $customCarbG,
        $targetBodyFatPercentage,
        $customProteinPercent,
        $customFatPercent,
        $customCarbPercent
    );

    json_ok(['id' => $id]);
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
