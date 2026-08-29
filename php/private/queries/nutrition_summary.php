<?php

// ==== 食事記録機能(design.md §2.11〜2.17、§7対応) ====

function fetch_latest_two_body_weights(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare(
        'SELECT weight, body_fat_percentage FROM body_weight_logs WHERE user_id = :user_id ORDER BY logged_date DESC LIMIT 2'
    );
    $stmt->execute(['user_id' => $userId]);
    return map_latest_two_body_weights_rows($stmt->fetchAll());
}

// BMI・BMR・TDEE・目標カロリー計算用(2026-08-20)。これらは体重を毎日記録するとは限らない
// 前提の「緩やかに変化する値」として扱いたいため、$date時点で分かっている直近の値
// (その日以前で一番新しい記録)を使う。プロフィールタブの「体重・BMI・体脂肪率」の表示自体は
// 運動・食事と揃えて「その日ちょうど」だけにしたいため、そちらはfetch_body_weight_on_dateを使う
// (このas-of版はTDEE等の計算専用)。目標作成時のstart_weightスナップショット
// (create_nutrition_goal)は「今まさに」の値であるべきなので、そちらは従来通り
// fetch_latest_two_body_weightsを使う。
function fetch_latest_two_body_weights_as_of(PDO $pdo, int $userId, string $date): array
{
    $stmt = $pdo->prepare(
        'SELECT weight, body_fat_percentage FROM body_weight_logs
         WHERE user_id = :user_id AND logged_date <= :date
         ORDER BY logged_date DESC LIMIT 2'
    );
    $stmt->execute(['user_id' => $userId, 'date' => $date]);
    return map_latest_two_body_weights_rows($stmt->fetchAll());
}

// プロフィールタブのサマリー表示用(2026-08-20)。「記録がない日にも直近の値が出るのは
// 紛らわしい」との指摘を受け、運動・食事と揃えて$dateにちょうど記録した行だけを返す
// (無ければnull)。
function fetch_body_weight_on_date(PDO $pdo, int $userId, string $date): ?array
{
    $stmt = $pdo->prepare(
        'SELECT weight, body_fat_percentage FROM body_weight_logs WHERE user_id = :user_id AND logged_date = :date'
    );
    $stmt->execute(['user_id' => $userId, 'date' => $date]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    return [
        'weight' => (float) $row['weight'],
        'body_fat_percentage' => $row['body_fat_percentage'] !== null ? (float) $row['body_fat_percentage'] : null,
    ];
}

function map_latest_two_body_weights_rows(array $rows): array
{
    return [
        'current' => isset($rows[0]) ? (float) $rows[0]['weight'] : null,
        'previous' => isset($rows[1]) ? (float) $rows[1]['weight'] : null,
        'current_body_fat_percentage' => isset($rows[0]) && $rows[0]['body_fat_percentage'] !== null
            ? (float) $rows[0]['body_fat_percentage'] : null,
    ];
}

function fetch_latest_nutrition_goal(PDO $pdo, int $userId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, start_weight, target_weight, target_body_fat_percentage, target_date, pfc_mode,
                custom_protein_g, custom_fat_g, custom_carb_g,
                custom_protein_percent, custom_fat_percent, custom_carb_percent
         FROM nutrition_goals WHERE user_id = :user_id ORDER BY created_at DESC, id DESC LIMIT 1'
    );
    $stmt->execute(['user_id' => $userId]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    return [
        'id' => (int) $row['id'],
        'start_weight' => (float) $row['start_weight'],
        'target_weight' => (float) $row['target_weight'],
        'target_body_fat_percentage' => $row['target_body_fat_percentage'] !== null ? (float) $row['target_body_fat_percentage'] : null,
        'target_date' => $row['target_date'],
        'pfc_mode' => $row['pfc_mode'],
        'custom_protein_g' => $row['custom_protein_g'] !== null ? (float) $row['custom_protein_g'] : null,
        'custom_fat_g' => $row['custom_fat_g'] !== null ? (float) $row['custom_fat_g'] : null,
        'custom_carb_g' => $row['custom_carb_g'] !== null ? (float) $row['custom_carb_g'] : null,
        'custom_protein_percent' => $row['custom_protein_percent'] !== null ? (float) $row['custom_protein_percent'] : null,
        'custom_fat_percent' => $row['custom_fat_percent'] !== null ? (float) $row['custom_fat_percent'] : null,
        'custom_carb_percent' => $row['custom_carb_percent'] !== null ? (float) $row['custom_carb_percent'] : null,
    ];
}

// design.md §2.11: start_weightは作成時点の直近体重のスナップショット。体重記録が1件も無い場合は作成できない。
// target_body_fat_percentageは任意項目(UI再設計フェーズ2、design.md未記載)。
function create_nutrition_goal(
    PDO $pdo,
    int $userId,
    float $targetWeight,
    string $targetDate,
    string $pfcMode,
    ?float $customProteinG,
    ?float $customFatG,
    ?float $customCarbG,
    ?float $targetBodyFatPercentage = null,
    ?float $customProteinPercent = null,
    ?float $customFatPercent = null,
    ?float $customCarbPercent = null
): int {
    $weights = fetch_latest_two_body_weights($pdo, $userId);
    if ($weights['current'] === null) {
        json_error('目標を設定する前に、まず体重を1件記録してください', 400);
    }
    $stmt = $pdo->prepare(
        'INSERT INTO nutrition_goals
            (user_id, start_weight, target_weight, target_body_fat_percentage, target_date, pfc_mode,
             custom_protein_g, custom_fat_g, custom_carb_g,
             custom_protein_percent, custom_fat_percent, custom_carb_percent)
         VALUES
            (:user_id, :start_weight, :target_weight, :target_body_fat_percentage, :target_date, :pfc_mode,
             :custom_protein_g, :custom_fat_g, :custom_carb_g,
             :custom_protein_percent, :custom_fat_percent, :custom_carb_percent)'
    );
    $stmt->execute([
        'user_id' => $userId,
        'start_weight' => $weights['current'],
        'target_weight' => $targetWeight,
        'target_body_fat_percentage' => $targetBodyFatPercentage,
        'target_date' => $targetDate,
        'pfc_mode' => $pfcMode,
        'custom_protein_g' => $customProteinG,
        'custom_fat_g' => $customFatG,
        'custom_carb_g' => $customCarbG,
        'custom_protein_percent' => $customProteinPercent,
        'custom_fat_percent' => $customFatPercent,
        'custom_carb_percent' => $customCarbPercent,
    ]);
    return (int) $pdo->lastInsertId();
}

// design.md §2.16・2.17: BMI・TDEE・目標カロリー・PFC・進捗マイルストーンをまとめて計算する。
// $todayはYYYY-MM-DD(呼び出し側でdate('Y-m-d')等を渡す。テストで日付を固定できるようにするため引数化)。
function build_nutrition_summary(PDO $pdo, int $userId, string $today): array
{
    $user = find_user_by_id($pdo, $userId);
    if (!$user) {
        json_error('ユーザーが見つかりません', 404);
    }
    $weights = fetch_latest_two_body_weights_as_of($pdo, $userId, $today);
    $weightOnDate = fetch_body_weight_on_date($pdo, $userId, $today);
    $goal = fetch_latest_nutrition_goal($pdo, $userId);

    // サマリー(食事タブ)の「本日の摂取カロリー・PFC」用。$todayの食事をitemsごと合算する
    $todayKcal = 0.0;
    $todayProtein = 0.0;
    $todayFat = 0.0;
    $todayCarb = 0.0;
    foreach (fetch_meals($pdo, $userId, $today, $today) as $meal) {
        foreach ($meal['items'] as $item) {
            $todayKcal += $item['kcal_per_100g'] * $item['quantity_g'] / 100;
            $todayProtein += $item['protein_g_per_100g'] * $item['quantity_g'] / 100;
            $todayFat += $item['fat_g_per_100g'] * $item['quantity_g'] / 100;
            $todayCarb += $item['carb_g_per_100g'] * $item['quantity_g'] / 100;
        }
    }

    $heightCm = $user['height_cm'] !== null ? (int) $user['height_cm'] : null;
    $activityLevel = $user['activity_level'];
    // BMR・TDEE・目標カロリーの計算には「直近で分かっている体重」(as-of)を使う一方、
    // プロフィールタブに表示するBMI・体重・体脂肪率は「その日ちょうどの記録」だけを使う
    // (2026-08-20、記録の無い日に古い値が出て紛らわしいとの指摘への対応)
    $currentWeight = $weights['current'];
    $weightForDisplay = $weightOnDate['weight'] ?? null;

    $bmi = null;
    $bmiCategory = null;
    if ($heightCm !== null && $weightForDisplay !== null) {
        $bmi = calculate_bmi($weightForDisplay, $heightCm);
        $bmiCategory = bmi_category_label($bmi);
    }

    $bmr = null;
    $tdee = null;
    if ($heightCm !== null && $currentWeight !== null && $user['birth_date'] !== null) {
        $age = calculate_age($user['birth_date'], $today);
        $bmr = calculate_bmr($currentWeight, $heightCm, $age, $user['gender']);
        $tdee = calculate_tdee($currentWeight, $heightCm, $age, $user['gender'], $activityLevel);
    }

    $goalSummary = null;
    if ($goal !== null && $currentWeight !== null) {
        $daysRemaining = days_until($goal['target_date'], $today);
        $overdue = is_goal_overdue($goal['target_date'], $today, $currentWeight, $goal['target_weight']);

        $targetCalories = null;
        $pfc = null;
        if ($goal['pfc_mode'] === 'custom') {
            // カスタムモードはユーザーが直接グラム数を決めるものなので、TDEE(身長・活動レベル)や
            // 達成日超過の有無に関わらず常に表示する(target_caloriesは表示用にカロリーへ逆算する)
            $pfc = calculate_pfc_grams('custom', 0, $currentWeight, $goal['custom_protein_g'], $goal['custom_fat_g'], $goal['custom_carb_g']);
            if ($pfc['protein_g'] !== null && $pfc['fat_g'] !== null && $pfc['carb_g'] !== null) {
                $targetCalories = $pfc['protein_g'] * 4 + $pfc['fat_g'] * 9 + $pfc['carb_g'] * 4;
            }
        } elseif (!$overdue && $tdee !== null) {
            // custom_ratioはstandard/bulk/cutと同じく、目標カロリーを起点にグラム数へ換算する
            $targetCalories = calculate_target_calories($tdee, $currentWeight, $goal['target_weight'], $daysRemaining);
            if ($targetCalories !== null) {
                $pfc = calculate_pfc_grams(
                    $goal['pfc_mode'],
                    $targetCalories,
                    $currentWeight,
                    null,
                    null,
                    null,
                    $goal['custom_protein_percent'],
                    $goal['custom_fat_percent'],
                    $goal['custom_carb_percent']
                );
            }
        }

        $progressPercent = calculate_progress_percent($goal['start_weight'], $currentWeight, $goal['target_weight']);
        $previousProgressPercent = $weights['previous'] !== null
            ? calculate_progress_percent($goal['start_weight'], $weights['previous'], $goal['target_weight'])
            : null;
        $milestone = $progressPercent !== null
            ? newly_reached_milestone($previousProgressPercent, $progressPercent)
            : null;

        $goalSummary = [
            'target_weight' => $goal['target_weight'],
            'target_date' => $goal['target_date'],
            'pfc_mode' => $goal['pfc_mode'],
            'days_remaining' => $daysRemaining,
            'overdue' => $overdue,
            'target_calories' => $targetCalories !== null ? round($targetCalories) : null,
            'pfc' => $pfc,
            'progress_percent' => $progressPercent !== null ? round($progressPercent, 1) : null,
            'newly_reached_milestone' => $milestone,
            // プロフィールタブのサマリー(現在のBMI・体脂肪率と並べて表示)向け。design.md未記載、UI再設計フェーズ2
            'target_bmi' => $heightCm !== null ? round(calculate_bmi($goal['target_weight'], $heightCm), 1) : null,
            'target_bmi_category' => $heightCm !== null ? bmi_category_label(calculate_bmi($goal['target_weight'], $heightCm)) : null,
            'target_body_fat_percentage' => $goal['target_body_fat_percentage'],
        ];
    }

    return [
        'height_cm' => $heightCm,
        'activity_level' => $activityLevel,
        'current_weight' => $weightForDisplay,
        'current_body_fat_percentage' => $weightOnDate['body_fat_percentage'] ?? null,
        'bmi' => $bmi !== null ? round($bmi, 1) : null,
        'bmi_category' => $bmiCategory,
        'bmr' => $bmr !== null ? round($bmr) : null,
        'tdee' => $tdee !== null ? round($tdee) : null,
        'today_kcal' => round($todayKcal),
        'today_protein_g' => round($todayProtein, 1),
        'today_fat_g' => round($todayFat, 1),
        'today_carb_g' => round($todayCarb, 1),
        'goal' => $goalSummary,
    ];
}
