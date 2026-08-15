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
    $pfcMode = require_enum($body, 'pfc_mode', ['standard', 'bulk', 'cut', 'custom']);

    $customProteinG = null;
    $customFatG = null;
    $customCarbG = null;
    if ($pfcMode === 'custom') {
        $customProteinG = require_non_negative_number($body, 'custom_protein_g');
        $customFatG = require_non_negative_number($body, 'custom_fat_g');
        $customCarbG = require_non_negative_number($body, 'custom_carb_g');
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
        $targetBodyFatPercentage
    );

    json_ok(['id' => $id]);
} catch (ValidationException $e) {
    json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
