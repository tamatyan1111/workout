<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

// design.md §2.16・2.17のBMI・TDEE・目標カロリー・PFC・進捗マイルストーン計算を検証する。
final class NutritionCalcTest extends TestCase
{
    public function testCalculateAgeBeforeBirthdayThisYear(): void
    {
        $this->assertSame(35, calculate_age('1990-06-15', '2026-06-14'));
    }

    public function testCalculateAgeOnBirthday(): void
    {
        $this->assertSame(36, calculate_age('1990-06-15', '2026-06-15'));
    }

    public function testCalculateBmi(): void
    {
        $this->assertEqualsWithDelta(22.86, calculate_bmi(70, 175), 0.01);
    }

    public function testBmiCategoryLabelBoundaries(): void
    {
        $this->assertSame('低体重(やせ)', bmi_category_label(18.4));
        $this->assertSame('普通体重', bmi_category_label(18.5));
        $this->assertSame('普通体重', bmi_category_label(24.9));
        $this->assertSame('肥満(1度)', bmi_category_label(25.0));
        $this->assertSame('肥満(4度)', bmi_category_label(40.0));
    }

    public function testCalculateBmrMale(): void
    {
        // 10*70 + 6.25*175 - 5*30 + 5 = 700 + 1093.75 - 150 + 5 = 1648.75
        $this->assertEqualsWithDelta(1648.75, calculate_bmr(70, 175, 30, 'male'), 0.01);
    }

    public function testCalculateBmrReturnsNullForUnspecifiedGender(): void
    {
        $this->assertNull(calculate_bmr(70, 175, 30, 'unspecified'));
    }

    public function testCalculateTdeeMale(): void
    {
        $tdee = calculate_tdee(70, 175, 30, 'male', 'sedentary');
        $this->assertEqualsWithDelta(1978.5, $tdee, 0.01);
    }

    public function testCalculateTdeeFemale(): void
    {
        $tdee = calculate_tdee(60, 160, 25, 'female', 'moderate');
        $this->assertEqualsWithDelta(2036.7, $tdee, 0.01);
    }

    public function testCalculateTdeeReturnsNullForUnspecifiedGender(): void
    {
        $this->assertNull(calculate_tdee(70, 175, 30, 'unspecified', 'sedentary'));
    }

    public function testCalculateTdeeReturnsNullWithoutActivityLevel(): void
    {
        $this->assertNull(calculate_tdee(70, 175, 30, 'male', null));
    }

    public function testDaysUntilFutureDate(): void
    {
        $this->assertSame(9, days_until('2026-01-10', '2026-01-01'));
    }

    public function testDaysUntilPastDateIsNegative(): void
    {
        $this->assertSame(-9, days_until('2026-01-01', '2026-01-10'));
    }

    public function testCalculateTargetCaloriesForWeightLoss(): void
    {
        $target = calculate_target_calories(2000, 70, 65, 50);
        $this->assertEqualsWithDelta(1280.0, $target, 0.01);
    }

    public function testCalculateTargetCaloriesReturnsNullWhenOverdue(): void
    {
        $this->assertNull(calculate_target_calories(2000, 70, 65, 0));
        $this->assertNull(calculate_target_calories(2000, 70, 65, -3));
    }

    public function testCalculatePfcGramsStandard(): void
    {
        $pfc = calculate_pfc_grams('standard', 2000, 70, null, null, null);
        $this->assertSame(75.0, $pfc['protein_g']);
        $this->assertEqualsWithDelta(55.6, $pfc['fat_g'], 0.01);
        $this->assertSame(300.0, $pfc['carb_g']);
        $this->assertNull($pfc['warning']);
    }

    public function testCalculatePfcGramsBulkUsesProteinPerKg(): void
    {
        $pfc = calculate_pfc_grams('bulk', 2500, 70, null, null, null);
        $this->assertSame(126.0, $pfc['protein_g']);
        $this->assertEqualsWithDelta(69.4, $pfc['fat_g'], 0.01);
        $this->assertEqualsWithDelta(342.8, $pfc['carb_g'], 0.01);
        $this->assertNull($pfc['warning']);
    }

    public function testCalculatePfcGramsCutClampsNegativeCarbWithWarning(): void
    {
        $pfc = calculate_pfc_grams('cut', 700, 70, null, null, null);
        $this->assertSame(140.0, $pfc['protein_g']);
        $this->assertEqualsWithDelta(19.4, $pfc['fat_g'], 0.01);
        $this->assertSame(0.0, $pfc['carb_g']);
        $this->assertNotNull($pfc['warning']);
    }

    public function testCalculatePfcGramsCustomReturnsGivenValues(): void
    {
        $pfc = calculate_pfc_grams('custom', 2000, 70, 150.0, 60.0, 200.0);
        $this->assertSame(150.0, $pfc['protein_g']);
        $this->assertSame(60.0, $pfc['fat_g']);
        $this->assertSame(200.0, $pfc['carb_g']);
    }

    // custom_ratio: standardと同じく目標カロリーを起点に、ユーザー指定の比率でグラム数へ換算する
    public function testCalculatePfcGramsCustomRatioConvertsPercentToGrams(): void
    {
        $pfc = calculate_pfc_grams('custom_ratio', 2000, 70, null, null, null, 20.0, 30.0, 50.0);
        // タンパク質: 2000 * 0.20 / 4 = 100.0
        $this->assertSame(100.0, $pfc['protein_g']);
        // 脂質: 2000 * 0.30 / 9 = 66.7
        $this->assertEqualsWithDelta(66.7, $pfc['fat_g'], 0.01);
        // 炭水化物: 2000 * 0.50 / 4 = 250.0
        $this->assertSame(250.0, $pfc['carb_g']);
        $this->assertNull($pfc['warning']);
    }

    public function testCalculateProgressPercent(): void
    {
        $this->assertEqualsWithDelta(50.0, calculate_progress_percent(80, 75, 70), 0.01);
    }

    public function testCalculateProgressPercentClampsAt100(): void
    {
        $this->assertSame(100.0, calculate_progress_percent(80, 65, 70));
    }

    public function testCalculateProgressPercentReturnsNullWhenStartEqualsTarget(): void
    {
        $this->assertNull(calculate_progress_percent(70, 65, 70));
    }

    public function testNewlyReachedMilestoneFirstCrossing(): void
    {
        $this->assertSame(25, newly_reached_milestone(20.0, 30.0));
    }

    public function testNewlyReachedMilestoneSkipsAlreadyReachedThresholds(): void
    {
        $this->assertSame(50, newly_reached_milestone(40.0, 60.0));
    }

    public function testNewlyReachedMilestoneReturnsNullWhenNoNewThreshold(): void
    {
        $this->assertNull(newly_reached_milestone(null, 10.0));
    }

    public function testNewlyReachedMilestoneAtCompletion(): void
    {
        $this->assertSame(100, newly_reached_milestone(90.0, 100.0));
    }

    public function testIsGoalOverdueBeforeTargetDateIsFalse(): void
    {
        $this->assertFalse(is_goal_overdue('2026-01-10', '2026-01-01', 70, 65));
    }

    public function testIsGoalOverdueWithinToleranceIsFalse(): void
    {
        $this->assertFalse(is_goal_overdue('2026-01-01', '2026-01-02', 70.0, 69.6));
    }

    public function testIsGoalOverdueBeyondToleranceIsTrue(): void
    {
        $this->assertTrue(is_goal_overdue('2026-01-01', '2026-01-02', 70.0, 69.4));
    }
}
