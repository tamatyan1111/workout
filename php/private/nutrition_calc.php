<?php
// design.md §2.16・2.17対応。BMI・TDEE・目標カロリー・PFCグラム数・進捗マイルストーンの計算ロジック。
// 全てDBアクセスを含まない純粋関数(呼び出し側がqueries.phpで取得した値を渡す。§2.9と同じく
// 何もキャッシュせず、表示のたびに都度計算する)。

const BMI_CATEGORIES = [
    ['max' => 18.5, 'label' => '低体重(やせ)'],
    ['max' => 25.0, 'label' => '普通体重'],
    ['max' => 30.0, 'label' => '肥満(1度)'],
    ['max' => 35.0, 'label' => '肥満(2度)'],
    ['max' => 40.0, 'label' => '肥満(3度)'],
];

// design.md §2.11(usersテーブル)の活動レベル4段階に対応するPAL係数(Mifflin-St Jeor式で一般的な値)
const ACTIVITY_LEVEL_FACTORS = [
    'sedentary' => 1.2,
    'light' => 1.375,
    'moderate' => 1.55,
    'active' => 1.725,
];

const KCAL_PER_KG_BODY_WEIGHT = 7200;

const MILESTONE_THRESHOLDS = [25, 50, 75, 100];

function calculate_age(string $birthDate, string $today): int
{
    $birth = new DateTimeImmutable($birthDate);
    $now = new DateTimeImmutable($today);
    return $birth->diff($now)->y;
}

function calculate_bmi(float $weightKg, int $heightCm): float
{
    $heightM = $heightCm / 100;
    return $weightKg / ($heightM * $heightM);
}

// 日本肥満学会の分類(requirements.md §7)
function bmi_category_label(float $bmi): string
{
    foreach (BMI_CATEGORIES as $category) {
        if ($bmi < $category['max']) {
            return $category['label'];
        }
    }
    return '肥満(4度)';
}

// 性別が'unspecified'、または活動レベル未設定の場合はMifflin-St Jeor式を計算できずnullを返す
function calculate_tdee(float $weightKg, int $heightCm, int $age, string $gender, ?string $activityLevel): ?float
{
    if ($gender !== 'male' && $gender !== 'female') {
        return null;
    }
    $factor = ACTIVITY_LEVEL_FACTORS[$activityLevel ?? ''] ?? null;
    if ($factor === null) {
        return null;
    }
    $bmr = $gender === 'male'
        ? 10 * $weightKg + 6.25 * $heightCm - 5 * $age + 5
        : 10 * $weightKg + 6.25 * $heightCm - 5 * $age - 161;
    return $bmr * $factor;
}

// 目標達成日までの残り日数(今日を含まない)。達成日を過ぎている場合は0以下になる。
function days_until(string $targetDate, string $today): int
{
    $target = new DateTimeImmutable($targetDate);
    $now = new DateTimeImmutable($today);
    return (int) $now->diff($target)->format('%r%a');
}

// design.md §2.16 手順4。daysRemainingが0以下(達成日超過)の場合はnullを返す
function calculate_target_calories(float $tdee, float $currentWeight, float $targetWeight, int $daysRemaining): ?float
{
    if ($daysRemaining <= 0) {
        return null;
    }
    $weightDiffKg = $targetWeight - $currentWeight;
    return $tdee + ($weightDiffKg * KCAL_PER_KG_BODY_WEIGHT) / $daysRemaining;
}

// design.md §2.16 手順5。pfc_modeごとにPFCグラム数を算出する。
// 戻り値: ['protein_g' => float|null, 'fat_g' => float|null, 'carb_g' => float|null, 'warning' => string|null]
function calculate_pfc_grams(
    string $pfcMode,
    float $targetCalories,
    float $currentWeight,
    ?float $customProteinG,
    ?float $customFatG,
    ?float $customCarbG
): array {
    if ($pfcMode === 'custom') {
        return [
            'protein_g' => $customProteinG,
            'fat_g' => $customFatG,
            'carb_g' => $customCarbG,
            'warning' => null,
        ];
    }

    if ($pfcMode === 'standard') {
        return [
            'protein_g' => round($targetCalories * 0.15 / 4, 1),
            'fat_g' => round($targetCalories * 0.25 / 9, 1),
            'carb_g' => round($targetCalories * 0.60 / 4, 1),
            'warning' => null,
        ];
    }

    // bulk/cut: タンパク質は体重×g/kgで固定、脂質は目標カロリーの25%、炭水化物は残り
    $proteinPerKg = $pfcMode === 'bulk' ? 1.8 : 2.0;
    $proteinG = $currentWeight * $proteinPerKg;
    $proteinKcal = $proteinG * 4;
    $fatKcal = $targetCalories * 0.25;
    $fatG = $fatKcal / 9;
    $carbKcal = $targetCalories - $proteinKcal - $fatKcal;

    $warning = null;
    if ($carbKcal < 0) {
        $carbKcal = 0;
        $warning = 'カロリー設定が低すぎるため、炭水化物の目標値を計算できません。目標を見直してください';
    }

    return [
        'protein_g' => round($proteinG, 1),
        'fat_g' => round($fatG, 1),
        'carb_g' => round($carbKcal / 4, 1),
        'warning' => $warning,
    ];
}

// design.md §2.17。増量目標・減量目標のどちらでも同じ式で計算できる。0〜100にクランプする。
// startWeight === targetWeight(進捗を定義できない)の場合はnullを返す。
function calculate_progress_percent(float $startWeight, float $currentWeight, float $targetWeight): ?float
{
    $denominator = $startWeight - $targetWeight;
    if (abs($denominator) < 0.0001) {
        return null;
    }
    $percent = (($startWeight - $currentWeight) / $denominator) * 100;
    return max(0.0, min(100.0, $percent));
}

// 「直近で新たに超えた閾値」を返す(該当なしはnull)。$previousPercentは1つ前の体重記録時点の進捗率。
function newly_reached_milestone(?float $previousPercent, float $currentPercent): ?int
{
    foreach (MILESTONE_THRESHOLDS as $threshold) {
        $alreadyReached = $previousPercent !== null && $previousPercent >= $threshold;
        if (!$alreadyReached && $currentPercent >= $threshold) {
            return $threshold;
        }
    }
    return null;
}

// design.md §2.17。達成日を過ぎており、かつ目標体重から許容誤差以上離れている場合にtrue
function is_goal_overdue(
    string $targetDate,
    string $today,
    float $currentWeight,
    float $targetWeight,
    float $toleranceKg = 0.5
): bool {
    if ($today <= $targetDate) {
        return false;
    }
    return abs($currentWeight - $targetWeight) > $toleranceKg;
}
