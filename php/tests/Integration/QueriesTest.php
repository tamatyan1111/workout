<?php

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\TestCase;

// design.md §2「データモデル」§1.2「データ分離の方針」のロジックを実DBに対して検証する。
// 接続先は env.php 経由(実OS環境変数優先)。CIはMariaDBサービスコンテナに向く。
final class QueriesTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = get_pdo();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        self::$pdo->exec('TRUNCATE TABLE logs');
        self::$pdo->exec('TRUNCATE TABLE body_weight_logs');
        self::$pdo->exec('TRUNCATE TABLE exercises');
        self::$pdo->exec('TRUNCATE TABLE cycles');
        self::$pdo->exec('TRUNCATE TABLE password_reset_tokens');
        self::$pdo->exec('TRUNCATE TABLE meal_items');
        self::$pdo->exec('TRUNCATE TABLE meals');
        self::$pdo->exec('TRUNCATE TABLE recipe_items');
        self::$pdo->exec('TRUNCATE TABLE recipes');
        self::$pdo->exec('TRUNCATE TABLE custom_foods');
        self::$pdo->exec('TRUNCATE TABLE eating_out_meals');
        self::$pdo->exec('TRUNCATE TABLE nutrition_goals');
        self::$pdo->exec('TRUNCATE TABLE foods');
        self::$pdo->exec('TRUNCATE TABLE users');
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

        // ユーザー1(メインのテスト対象)とユーザー2(design.md §1.2のデータ分離検証用)
        self::$pdo->exec(
            "INSERT INTO users (id, email, password_hash, display_name)
             VALUES (1, 'user1@example.com', '\$2y\$10\$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012', 'ユーザー1'),
                    (2, 'user2@example.com', '\$2y\$10\$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012', 'ユーザー2')"
        );
        self::$pdo->exec(
            "INSERT INTO cycles (id, user_id, label) VALUES (1, 1, 'Push'), (2, 2, 'Push')"
        );
        self::$pdo->exec(
            "INSERT INTO exercises (id, user_id, cycle_id, is_discontinued, name, target_weight, target_reps, target_sets)
             VALUES
               (1, 1, 1, 0, 'ベンチプレス', 80, 12, 3),
               (2, 1, 1, 0, 'エアロバイク', NULL, 20, 1),
               (3, 1, 1, 1, '廃止種目', NULL, NULL, NULL),
               (4, 2, 2, 0, 'ユーザー2の種目', 50, 10, 3)"
        );
        // 食事記録機能(design.md §2.11〜2.15)のテスト用マスタデータ。
        // 2件目は実データ(日本食品標準成分表)の命名を再現したもの:単語の間に別の語が挟まる形式
        self::$pdo->exec(
            "INSERT INTO foods (id, food_number, food_group_code, food_group_name, name, kcal_per_100g, protein_g_per_100g, fat_g_per_100g, carb_g_per_100g)
             VALUES
               (1, '01001', '01', '穀類', '白米', 342.0, 6.10, 0.90, 77.60),
               (2, '11219', '11', '肉類', '＜鳥肉類＞　にわとり　［若どり・主品目］　むね　皮なし　生', 105.0, 23.30, 1.90, 0.10)"
        );
    }

    public function testFetchBoardReturnsOnlyOwnExercises(): void
    {
        $board = fetch_board(self::$pdo, 1, '2026-01-01');
        $this->assertCount(3, $board);
    }

    // design.md §1.2: 他ユーザーのデータは一切見えないことを保証する重要なテスト
    public function testFetchBoardDoesNotLeakOtherUsersExercises(): void
    {
        $board = fetch_board(self::$pdo, 1, '2026-01-01');
        $ids = array_column($board, 'id');
        $this->assertNotContains(4, $ids);
    }

    public function testFetchBoardMarksWeightBasedByTarget(): void
    {
        $bench = $this->findById(fetch_board(self::$pdo, 1, '2026-01-01'), 1);
        $this->assertTrue($bench['is_weight_based']);
    }

    public function testFetchBoardMarksWeightlessWhenNoTargetAndNoLogs(): void
    {
        $bike = $this->findById(fetch_board(self::$pdo, 1, '2026-01-01'), 2);
        $this->assertFalse($bike['is_weight_based']);
    }

    // design.md §2.8: 廃止種目は目標重量が無くても、過去に重量ありの記録が1件でもあれば重量あり種目とみなす
    public function testFetchBoardMarksWeightBasedFromPastLogsEvenWithoutTarget(): void
    {
        self::$pdo->exec(
            "INSERT INTO logs (user_id, exercise_id, logged_date, set_number, weight, reps)
             VALUES (1, 3, '2026-01-01', 1, 10.0, 12)"
        );
        $discontinued = $this->findById(fetch_board(self::$pdo, 1, '2026-01-01'), 3);
        $this->assertTrue($discontinued['is_weight_based']);
    }

    public function testFetchBoardCurrentIsEmptyWithoutLogs(): void
    {
        $bench = $this->findById(fetch_board(self::$pdo, 1, '2026-01-01'), 1);
        $this->assertSame([], $bench['current']);
    }

    // 2026-08-20: サマリーの日付ナビ追加に伴い、「種目ごとの最終記録日」ではなく
    // 「指定日ちょうどの記録」だけを(weight, reps)ごとにグルーピングして返す仕様に変更
    public function testFetchBoardCurrentOnlyReflectsGivenDate(): void
    {
        self::$pdo->exec(
            "INSERT INTO logs (user_id, exercise_id, logged_date, set_number, weight, reps) VALUES
                (1, 1, '2026-01-01', 1, 60, 10),
                (1, 1, '2026-01-02', 1, 80, 12),
                (1, 1, '2026-01-02', 2, 80, 12)"
        );
        $bench = $this->findById(fetch_board(self::$pdo, 1, '2026-01-02'), 1);
        $this->assertCount(1, $bench['current']);
        $this->assertSame(80.0, $bench['current'][0]['weight']);
        $this->assertSame(2, $bench['current'][0]['sets']);

        $benchOnEarlierDate = $this->findById(fetch_board(self::$pdo, 1, '2026-01-01'), 1);
        $this->assertCount(1, $benchOnEarlierDate['current']);
        $this->assertSame(60.0, $benchOnEarlierDate['current'][0]['weight']);
    }

    // 2026-08-20: 「運動を記録」フォームの初期値(前回の重量・回数)用。currentが指定日
    // ちょうどの記録に変わったのに巻き込まれて、前回値の初期入力が効かなくなっていた不具合の
    // 回帰テスト。latestは選んだ日に関わらず種目ごとの直近の記録を常に返す
    public function testFetchBoardLatestReflectsMostRecentLogRegardlessOfGivenDate(): void
    {
        self::$pdo->exec(
            "INSERT INTO logs (user_id, exercise_id, logged_date, set_number, weight, reps) VALUES
                (1, 1, '2026-01-01', 1, 60, 10),
                (1, 1, '2026-01-02', 1, 80, 12),
                (1, 1, '2026-01-02', 2, 80, 12)"
        );
        // 2026-01-03には何も記録していないので、currentは空だがlatestは直近(01-02)の内容を返す
        $bench = $this->findById(fetch_board(self::$pdo, 1, '2026-01-03'), 1);
        $this->assertSame([], $bench['current']);
        $this->assertCount(1, $bench['latest']);
        $this->assertSame(80.0, $bench['latest'][0]['weight']);
        $this->assertSame(2, $bench['latest'][0]['sets']);
    }

    public function testIsWeightlessReturnsFalseWhenTargetWeightSet(): void
    {
        $this->assertFalse(is_weightless(self::$pdo, 1));
    }

    public function testIsWeightlessReturnsTrueWithoutTargetOrLogs(): void
    {
        $this->assertTrue(is_weightless(self::$pdo, 2));
    }

    public function testExerciseHasLogsFalseInitially(): void
    {
        $this->assertFalse(exercise_has_logs(self::$pdo, 1));
    }

    public function testExerciseHasLogsTrueAfterInsert(): void
    {
        self::$pdo->exec(
            "INSERT INTO logs (user_id, exercise_id, logged_date, set_number, weight, reps)
             VALUES (1, 1, '2026-01-01', 1, 60, 10)"
        );
        $this->assertTrue(exercise_has_logs(self::$pdo, 1));
    }

    // design.md §1.2: 他ユーザーのexercise_idを指定してもnullが返り、参照できない
    public function testFindExerciseReturnsNullForOtherUsersExercise(): void
    {
        $this->assertNull(find_exercise(self::$pdo, 1, 4));
        $this->assertNotNull(find_exercise(self::$pdo, 2, 4));
    }

    public function testFindLogReturnsNullForOtherUsersLog(): void
    {
        self::$pdo->exec(
            "INSERT INTO logs (id, user_id, exercise_id, logged_date, set_number, weight, reps)
             VALUES (1, 1, 1, '2026-01-01', 1, 60, 10)"
        );
        $this->assertNull(find_log(self::$pdo, 2, 1));
        $this->assertNotNull(find_log(self::$pdo, 1, 1));
    }

    // ==== サイクル ====

    public function testFetchCyclesReturnsOnlyOwnCycles(): void
    {
        $cycles = fetch_cycles(self::$pdo, 1);
        $this->assertCount(1, $cycles);
        $this->assertSame('Push', $cycles[0]['label']);
    }

    public function testCreateCycleThenFindCycle(): void
    {
        $id = create_cycle(self::$pdo, 1, 'Pull');
        $cycle = find_cycle(self::$pdo, 1, $id);
        $this->assertSame('Pull', $cycle['label']);
    }

    public function testFindCycleReturnsNullForOtherUsersCycle(): void
    {
        $this->assertNull(find_cycle(self::$pdo, 1, 2));
    }

    public function testCycleLabelExistsIsScopedPerUser(): void
    {
        $this->assertTrue(cycle_label_exists(self::$pdo, 1, 'Push'));
        // ユーザー2にも同名"Push"があるが、これはユーザー1のスコープでの重複判定には影響しない
        $this->assertFalse(cycle_label_exists(self::$pdo, 1, 'Legs'));
    }

    public function testCycleHasExercisesTrueWhenExercisesExist(): void
    {
        $this->assertTrue(cycle_has_exercises(self::$pdo, 1));
    }

    public function testCycleHasExercisesFalseForEmptyCycle(): void
    {
        $id = create_cycle(self::$pdo, 1, 'Legs');
        $this->assertFalse(cycle_has_exercises(self::$pdo, $id));
    }

    public function testDeleteCycleRemovesRow(): void
    {
        $id = create_cycle(self::$pdo, 1, 'Legs');
        delete_cycle(self::$pdo, $id);
        $this->assertNull(find_cycle(self::$pdo, 1, $id));
    }

    // ==== 体重の推移 ====

    public function testUpsertBodyWeightLogInsertsNewRow(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 68.5);
        $logs = fetch_body_weight_logs(self::$pdo, 1, null, null);
        $this->assertCount(1, $logs);
        $this->assertSame(68.5, $logs[0]['weight']);
    }

    public function testUpsertBodyWeightLogOverwritesSameDate(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 68.5);
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 69.0);
        $logs = fetch_body_weight_logs(self::$pdo, 1, null, null);
        $this->assertCount(1, $logs);
        $this->assertSame(69.0, $logs[0]['weight']);
    }

    public function testFetchBodyWeightLogsIsScopedPerUser(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 68.5);
        upsert_body_weight_log(self::$pdo, 2, '2026-08-01', 90.0);
        $this->assertCount(1, fetch_body_weight_logs(self::$pdo, 1, null, null));
    }

    // 「直近の履歴」用。直近$limit件だけを日付昇順(古い→新しい)で返す
    // 2026-08-19: 「直近の履歴」で新しい記録を上に表示するため、日付降順で返す
    // (以前は表示直前に反転する前提で昇順だった)
    public function testFetchBodyWeightLogsWithLimitReturnsMostRecentInDescendingOrder(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 70.0);
        upsert_body_weight_log(self::$pdo, 1, '2026-08-02', 69.5);
        upsert_body_weight_log(self::$pdo, 1, '2026-08-03', 69.0);

        $logs = fetch_body_weight_logs(self::$pdo, 1, null, null, 2);

        $this->assertCount(2, $logs);
        $this->assertSame('2026-08-03', $logs[0]['logged_date']);
        $this->assertSame('2026-08-02', $logs[1]['logged_date']);
    }

    public function testDeleteBodyWeightLogRemovesRow(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 68.5);
        $id = fetch_body_weight_logs(self::$pdo, 1, null, null)[0]['id'];
        delete_body_weight_log(self::$pdo, $id);
        $this->assertCount(0, fetch_body_weight_logs(self::$pdo, 1, null, null));
    }

    public function testUpsertBodyWeightLogPersistsBodyFatPercentage(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 68.5, 18.5);
        $logs = fetch_body_weight_logs(self::$pdo, 1, null, null);
        $this->assertSame(18.5, $logs[0]['body_fat_percentage']);
    }

    public function testBodyFatPercentageIsNullByDefault(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 68.5);
        $logs = fetch_body_weight_logs(self::$pdo, 1, null, null);
        $this->assertNull($logs[0]['body_fat_percentage']);
    }

    public function testUpdateBodyWeightLogUpdatesBodyFatPercentage(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 68.5, 18.5);
        $id = fetch_body_weight_logs(self::$pdo, 1, null, null)[0]['id'];
        update_body_weight_log(self::$pdo, 1, $id, '2026-08-01', 68.0, 18.0);
        $logs = fetch_body_weight_logs(self::$pdo, 1, null, null);
        $this->assertSame(18.0, $logs[0]['body_fat_percentage']);
    }

    // ==== ユーザー・アカウント削除 ====

    public function testFindUserByEmail(): void
    {
        $user = find_user_by_email(self::$pdo, 'user1@example.com');
        $this->assertSame(1, (int) $user['id']);
    }

    public function testFindUserByEmailReturnsNullWhenNotFound(): void
    {
        $this->assertNull(find_user_by_email(self::$pdo, 'nobody@example.com'));
    }

    public function testCreateUserWithPasswordAssignsId(): void
    {
        $id = create_user_with_password(self::$pdo, 'new@example.com', 'hash', '新規ユーザー');
        $this->assertNotNull(find_user_by_id(self::$pdo, $id));
    }

    // design.md §2.1: 既存のメール/パスワードアカウントにGoogleログインを後付けで紐づけられる
    // ことを確認する(実際に本番で発生した、email UNIQUE制約違反の再発防止)
    public function testLinkGoogleToUserSetsGoogleSub(): void
    {
        link_google_to_user(self::$pdo, 1, 'google-sub-12345');
        $user = find_user_by_id(self::$pdo, 1);
        $this->assertSame('google-sub-12345', $user['google_sub']);

        $viaGoogle = find_user_by_google_sub(self::$pdo, 'google-sub-12345');
        $this->assertSame(1, (int) $viaGoogle['id']);
    }

    // design.md §1.3: 依存関係の順に削除し、外部キー制約違反を起こさず全データを消せることを確認する
    public function testDeleteUserAccountRemovesAllRelatedData(): void
    {
        self::$pdo->exec(
            "INSERT INTO logs (user_id, exercise_id, logged_date, set_number, weight, reps)
             VALUES (1, 1, '2026-01-01', 1, 60, 10)"
        );
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 68.5);
        create_custom_food(self::$pdo, 1, '自家製プロテインバー', 400, 20, 10, 40);
        create_recipe(self::$pdo, 1, 'テストレシピ', [
            ['master_food_id' => 1, 'custom_food_id' => null, 'quantity_g' => 100.0],
        ]);
        $mealId = create_meal(self::$pdo, 1, '2026-08-01', 'lunch', null);
        insert_meal_items(self::$pdo, 1, $mealId, [
            ['master_food_id' => 1, 'custom_food_id' => null, 'eating_out_meal_id' => null, 'quantity_g' => 100.0,
             'food' => ['name' => '白米', 'kcal_per_100g' => 342.0, 'protein_g_per_100g' => 6.1, 'fat_g_per_100g' => 0.9, 'carb_g_per_100g' => 77.6]],
        ], null, null);
        create_nutrition_goal(self::$pdo, 1, 65.0, '2026-12-01', 'standard', null, null, null);

        delete_user_account(self::$pdo, 1);

        $this->assertNull(find_user_by_id(self::$pdo, 1));
        $this->assertCount(0, fetch_cycles(self::$pdo, 1));
        $this->assertCount(0, fetch_board(self::$pdo, 1, '2026-01-01'));
        $this->assertCount(0, fetch_body_weight_logs(self::$pdo, 1, null, null));
        $this->assertCount(0, fetch_custom_foods(self::$pdo, 1));
        $this->assertCount(0, fetch_recipes(self::$pdo, 1));
        $this->assertCount(0, fetch_meals(self::$pdo, 1, null, null));
        $this->assertNull(fetch_latest_nutrition_goal(self::$pdo, 1));
        // ユーザー2のデータは影響を受けない
        $this->assertNotNull(find_user_by_id(self::$pdo, 2));
    }

    // ==== 食事記録機能(design.md §2.11〜2.15、§7対応) ====

    public function testFetchLatestTwoBodyWeightsOrdersByDateDescending(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 70.0);
        upsert_body_weight_log(self::$pdo, 1, '2026-08-03', 68.0);
        upsert_body_weight_log(self::$pdo, 1, '2026-08-02', 69.0);

        $weights = fetch_latest_two_body_weights(self::$pdo, 1);
        $this->assertSame(68.0, $weights['current']);
        $this->assertSame(69.0, $weights['previous']);
    }

    public function testCreateNutritionGoalSnapshotsStartWeightFromLatestBodyWeight(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 70.0);

        $id = create_nutrition_goal(self::$pdo, 1, 65.0, '2026-12-01', 'cut', null, null, null);
        $goal = fetch_latest_nutrition_goal(self::$pdo, 1);

        $this->assertSame($id, $goal['id']);
        $this->assertSame(70.0, $goal['start_weight']);
        $this->assertSame(65.0, $goal['target_weight']);
        $this->assertSame('cut', $goal['pfc_mode']);
    }

    // design.md §2.11: 目標設定は新しい行をINSERTするだけで、最新の1件が「現在の目標」になる
    public function testFetchLatestNutritionGoalReturnsMostRecentlyCreated(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 70.0);
        create_nutrition_goal(self::$pdo, 1, 68.0, '2026-10-01', 'standard', null, null, null);
        create_nutrition_goal(self::$pdo, 1, 65.0, '2026-12-01', 'cut', null, null, null);

        $goal = fetch_latest_nutrition_goal(self::$pdo, 1);
        $this->assertSame(65.0, $goal['target_weight']);
    }

    public function testCreateNutritionGoalPersistsTargetBodyFatPercentage(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 70.0);
        create_nutrition_goal(self::$pdo, 1, 65.0, '2026-12-01', 'cut', null, null, null, 15.0);

        $goal = fetch_latest_nutrition_goal(self::$pdo, 1);
        $this->assertSame(15.0, $goal['target_body_fat_percentage']);
    }

    public function testTargetBodyFatPercentageIsNullByDefault(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 70.0);
        create_nutrition_goal(self::$pdo, 1, 65.0, '2026-12-01', 'cut', null, null, null);

        $goal = fetch_latest_nutrition_goal(self::$pdo, 1);
        $this->assertNull($goal['target_body_fat_percentage']);
    }

    public function testSearchFoodsIncludesMasterFoods(): void
    {
        $results = search_foods(self::$pdo, 1, '白米', null, null, null);
        $this->assertCount(1, $results);
        $this->assertSame('master', $results[0]['source']);
    }

    // 実データ検証で判明: 食品標準成分表の名称は「にわとり　［若どり・主品目］　むね　生」のように
    // 単語の間に別の語が挟まるため、単純な1つのLIKEでは複数語検索がヒットしない。単語ごとのAND一致で
    // ヒットすることを確認する
    public function testSearchFoodsMatchesAllWordsEvenWhenNotAdjacentInName(): void
    {
        $results = search_foods(self::$pdo, 1, 'にわとり むね', null, null, null);
        $this->assertCount(1, $results);
        $this->assertStringContainsString('にわとり', $results[0]['name']);

        $this->assertCount(0, search_foods(self::$pdo, 1, 'にわとり もも', null, null, null));
    }

    // design.md §1.2: 独自食材は他ユーザーから見えない
    public function testSearchFoodsIsScopedPerUserForCustomFoods(): void
    {
        create_custom_food(self::$pdo, 1, 'ユーザー1の自作スムージー', 200, 10, 5, 30);
        create_custom_food(self::$pdo, 2, 'ユーザー2の自作スムージー', 200, 10, 5, 30);

        $results = search_foods(self::$pdo, 1, 'スムージー', null, null, null);
        $this->assertCount(1, $results);
        $this->assertSame('ユーザー1の自作スムージー', $results[0]['name']);
    }

    public function testCustomFoodInUseTrueWhenReferencedByRecipe(): void
    {
        $customFoodId = create_custom_food(self::$pdo, 1, 'プロテインパウダー', 380, 80, 5, 5);
        $this->assertFalse(custom_food_in_use(self::$pdo, $customFoodId));

        create_recipe(self::$pdo, 1, 'プロテインシェイク', [
            ['master_food_id' => null, 'custom_food_id' => $customFoodId, 'quantity_g' => 30.0],
        ]);

        $this->assertTrue(custom_food_in_use(self::$pdo, $customFoodId));
    }

    // ==== 外食(eating_out_meals) ====

    public function testCreateEatingOutMealThenFindIt(): void
    {
        $id = create_eating_out_meal(self::$pdo, 1, 'ラーメン(豚骨)', null, 650.0, 25.0, 20.0, 90.0);
        $meal = find_eating_out_meal(self::$pdo, 1, $id);
        $this->assertSame('ラーメン(豚骨)', $meal['name']);
        $this->assertSame(650.0, $meal['kcal']);
        $this->assertSame(90.0, $meal['carb_g']);
    }

    // design.md §1.2: 外食メニューは他ユーザーから見えない
    public function testFetchEatingOutMealsIsScopedPerUser(): void
    {
        create_eating_out_meal(self::$pdo, 1, 'ユーザー1の外食', null, 500.0, 20.0, 15.0, 60.0);
        create_eating_out_meal(self::$pdo, 2, 'ユーザー2の外食', null, 500.0, 20.0, 15.0, 60.0);

        $meals = fetch_eating_out_meals(self::$pdo, 1);
        $this->assertCount(1, $meals);
        $this->assertSame('ユーザー1の外食', $meals[0]['name']);
        $this->assertNull(find_eating_out_meal(self::$pdo, 1, 999));
    }

    public function testUpdateEatingOutMeal(): void
    {
        $id = create_eating_out_meal(self::$pdo, 1, '牛丼(並)', null, 700.0, 22.0, 25.0, 95.0);
        update_eating_out_meal(self::$pdo, $id, '牛丼(大盛り)', null, 900.0, 28.0, 30.0, 120.0);

        $meal = find_eating_out_meal(self::$pdo, 1, $id);
        $this->assertSame('牛丼(大盛り)', $meal['name']);
        $this->assertSame(900.0, $meal['kcal']);
    }

    public function testDeleteEatingOutMealRemovesIt(): void
    {
        $id = create_eating_out_meal(self::$pdo, 1, 'コンビニ弁当', null, 600.0, 18.0, 22.0, 75.0);
        delete_eating_out_meal(self::$pdo, $id);
        $this->assertNull(find_eating_out_meal(self::$pdo, 1, $id));
    }

    // 2026-08-18追加: 店名(任意項目、design.md §2.20)
    public function testCreateEatingOutMealWithShopNameThenFindIt(): void
    {
        $id = create_eating_out_meal(self::$pdo, 1, '豚骨ラーメン', '一蘭', 650.0, 25.0, 20.0, 90.0);
        $meal = find_eating_out_meal(self::$pdo, 1, $id);
        $this->assertSame('豚骨ラーメン', $meal['name']);
        $this->assertSame('一蘭', $meal['shop_name']);
    }

    // 外食は「材料不明・1食分固定」のため、quantity_g=100固定でper_100g相当のスナップショットに
    // そのまま入る(design.md §2.20)
    public function testResolveItemsForMealAcceptsEatingOutMealId(): void
    {
        $eatingOutId = create_eating_out_meal(self::$pdo, 1, 'ラーメン(豚骨)', null, 650.0, 25.0, 20.0, 90.0);

        [$items] = resolve_items_for_meal(self::$pdo, 1, null, [
            ['eating_out_meal_id' => $eatingOutId, 'quantity_g' => 100.0],
        ]);

        $this->assertSame($eatingOutId, $items[0]['eating_out_meal_id']);
        $this->assertNull($items[0]['master_food_id']);
        $this->assertNull($items[0]['custom_food_id']);
        $this->assertSame('ラーメン(豚骨)', $items[0]['food']['name']);
        $this->assertSame(650.0, $items[0]['food']['kcal_per_100g']);
    }

    // 2026-08-19追加: 店名は料理名とは別に保持し、結合しない(直近の履歴で
    // 「1行目=店名、2行目=料理名」のように分けて表示するため、design.md §2.20)
    public function testResolveItemsForMealKeepsShopNameSeparateFromFoodName(): void
    {
        $eatingOutId = create_eating_out_meal(self::$pdo, 1, '豚骨ラーメン', '一蘭', 650.0, 25.0, 20.0, 90.0);

        [$items] = resolve_items_for_meal(self::$pdo, 1, null, [
            ['eating_out_meal_id' => $eatingOutId, 'quantity_g' => 100.0],
        ]);

        $this->assertSame('豚骨ラーメン', $items[0]['food']['name']);
        $this->assertSame('一蘭', $items[0]['food']['shop_name']);
    }

    // 2026-08-19追加: 店名はmeal_items.eating_out_shop_name_snapshotに保存され、
    // fetch_meals()で食品名とは別のキーとして返る
    public function testFetchMealsIncludesEatingOutShopNameSnapshot(): void
    {
        $eatingOutId = create_eating_out_meal(self::$pdo, 1, '豚骨ラーメン', '一蘭', 650.0, 25.0, 20.0, 90.0);
        $mealId = create_meal(self::$pdo, 1, '2026-08-19', 'dinner', null);
        [$items] = resolve_items_for_meal(self::$pdo, 1, null, [
            ['eating_out_meal_id' => $eatingOutId, 'quantity_g' => 100.0],
        ]);
        insert_meal_items(self::$pdo, 1, $mealId, $items, null, null);

        $fetched = fetch_meals(self::$pdo, 1, null, null)[0]['items'][0];
        $this->assertSame('豚骨ラーメン', $fetched['food_name']);
        $this->assertSame('一蘭', $fetched['eating_out_shop_name']);
    }

    public function testCreateRecipeThenFetchRecipesIncludesItems(): void
    {
        $customFoodId = create_custom_food(self::$pdo, 1, '自家製だし', 5, 0.5, 0, 1);
        create_recipe(self::$pdo, 1, '味噌汁', [
            ['master_food_id' => 1, 'custom_food_id' => null, 'quantity_g' => 50.0],
            ['master_food_id' => null, 'custom_food_id' => $customFoodId, 'quantity_g' => 200.0],
        ]);

        $recipes = fetch_recipes(self::$pdo, 1);
        $this->assertCount(1, $recipes);
        $this->assertSame('味噌汁', $recipes[0]['name']);
        $this->assertCount(2, $recipes[0]['items']);
    }

    public function testDeleteRecipeCascadesToRecipeItems(): void
    {
        $recipeId = create_recipe(self::$pdo, 1, '削除予定レシピ', [
            ['master_food_id' => 1, 'custom_food_id' => null, 'quantity_g' => 100.0],
        ]);

        delete_recipe(self::$pdo, $recipeId);

        $this->assertNull(find_recipe(self::$pdo, 1, $recipeId));
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM recipe_items WHERE recipe_id = :id');
        $stmt->execute(['id' => $recipeId]);
        $this->assertSame(0, (int) $stmt->fetchColumn());
    }

    public function testExpandRecipeItemsResolvesCurrentNutritionValues(): void
    {
        $recipeId = create_recipe(self::$pdo, 1, 'ごはん', [
            ['master_food_id' => 1, 'custom_food_id' => null, 'quantity_g' => 150.0],
        ]);

        $items = expand_recipe_items(self::$pdo, 1, $recipeId);

        $this->assertCount(1, $items);
        $this->assertSame(150.0, $items[0]['quantity_g']);
        $this->assertSame('白米', $items[0]['food']['name']);
        $this->assertSame(342.0, $items[0]['food']['kcal_per_100g']);
    }

    // design.md §2.19: 共有を有効化すると、そのハッシュでレシピが引ける
    public function testEnableRecipeSharingMakesRecipeFindableByToken(): void
    {
        $recipeId = create_recipe(self::$pdo, 1, '共有レシピ', [
            ['master_food_id' => 1, 'custom_food_id' => null, 'quantity_g' => 100.0],
        ]);

        $token = enable_recipe_sharing(self::$pdo, 1, $recipeId);
        $found = find_recipe_by_share_token(self::$pdo, hash_token($token));

        $this->assertNotNull($found);
        $this->assertSame($recipeId, (int) $found['id']);
        $this->assertSame(1, (int) $found['user_id']);
        $this->assertSame('共有レシピ', $found['name']);

        $recipes = fetch_recipes(self::$pdo, 1);
        $this->assertTrue($recipes[0]['is_shared']);
    }

    // 再度共有すると新しいトークンになり、古いトークンはもう使えない(暗黙のリンク再発行)
    public function testEnableRecipeSharingTwiceRotatesToken(): void
    {
        $recipeId = create_recipe(self::$pdo, 1, 'ローテーション確認', [
            ['master_food_id' => 1, 'custom_food_id' => null, 'quantity_g' => 100.0],
        ]);

        $firstToken = enable_recipe_sharing(self::$pdo, 1, $recipeId);
        $secondToken = enable_recipe_sharing(self::$pdo, 1, $recipeId);

        $this->assertNotSame($firstToken, $secondToken);
        $this->assertNull(find_recipe_by_share_token(self::$pdo, hash_token($firstToken)));
        $this->assertNotNull(find_recipe_by_share_token(self::$pdo, hash_token($secondToken)));
    }

    public function testDisableRecipeSharingInvalidatesToken(): void
    {
        $recipeId = create_recipe(self::$pdo, 1, '共有解除確認', [
            ['master_food_id' => 1, 'custom_food_id' => null, 'quantity_g' => 100.0],
        ]);
        $token = enable_recipe_sharing(self::$pdo, 1, $recipeId);

        disable_recipe_sharing(self::$pdo, 1, $recipeId);

        $this->assertNull(find_recipe_by_share_token(self::$pdo, hash_token($token)));
        $this->assertFalse(fetch_recipes(self::$pdo, 1)[0]['is_shared']);
    }

    // design.md §1.2: 他ユーザーのレシピIDを指定しても共有の有効化・無効化はできない
    public function testEnableAndDisableRecipeSharingAreScopedPerUser(): void
    {
        $recipeId = create_recipe(self::$pdo, 1, '他人のレシピ', [
            ['master_food_id' => 1, 'custom_food_id' => null, 'quantity_g' => 100.0],
        ]);

        $token = enable_recipe_sharing(self::$pdo, 2, $recipeId);
        $this->assertNull(find_recipe_by_share_token(self::$pdo, hash_token($token)));
        $this->assertFalse(fetch_recipes(self::$pdo, 1)[0]['is_shared']);

        enable_recipe_sharing(self::$pdo, 1, $recipeId);
        disable_recipe_sharing(self::$pdo, 2, $recipeId);
        $this->assertTrue(fetch_recipes(self::$pdo, 1)[0]['is_shared']);
    }

    // 共有リンク経由の閲覧フロー全体(get_shared_recipe.phpが辿る経路)を通しで確認
    public function testSharedRecipeFlowResolvesCurrentNutritionForViewer(): void
    {
        $recipeId = create_recipe(self::$pdo, 1, '共有閲覧確認', [
            ['master_food_id' => 1, 'custom_food_id' => null, 'quantity_g' => 150.0],
        ]);
        $token = enable_recipe_sharing(self::$pdo, 1, $recipeId);

        $recipe = find_recipe_by_share_token(self::$pdo, hash_token($token));
        $this->assertNotNull($recipe);
        $items = expand_recipe_items(self::$pdo, (int) $recipe['user_id'], (int) $recipe['id']);

        $this->assertSame('共有閲覧確認', $recipe['name']);
        $this->assertCount(1, $items);
        $this->assertSame(150.0, $items[0]['quantity_g']);
        $this->assertSame(342.0, $items[0]['food']['kcal_per_100g']);
    }

    // design.md §2.15: meal_itemsは追加した瞬間の栄養値をスナップショットし、
    // 後からcustom_foodsの値を編集しても過去のログの計算結果は変わらない
    public function testInsertMealItemsSnapshotsNutritionAtTimeOfLogging(): void
    {
        $customFoodId = create_custom_food(self::$pdo, 1, '自家製プロテインバー', 400, 20, 10, 40);
        $mealId = create_meal(self::$pdo, 1, '2026-08-01', 'snack', null);
        $food = resolve_food_source(self::$pdo, 1, null, $customFoodId);
        insert_meal_items(self::$pdo, 1, $mealId, [
            ['master_food_id' => null, 'custom_food_id' => $customFoodId, 'eating_out_meal_id' => null, 'quantity_g' => 50.0, 'food' => $food],
        ], null, null);

        // ログ後にカロリーを大きく変更する
        update_custom_food(self::$pdo, $customFoodId, '自家製プロテインバー', 900, 20, 10, 40);

        $meals = fetch_meals(self::$pdo, 1, null, null);
        $this->assertSame(400.0, $meals[0]['items'][0]['kcal_per_100g']);
    }

    public function testExpandRecipeToMealItemsGroupsByRecipeBatchId(): void
    {
        $recipeId = create_recipe(self::$pdo, 1, 'カレーライス', [
            ['master_food_id' => 1, 'custom_food_id' => null, 'quantity_g' => 200.0],
        ]);
        $mealId = create_meal(self::$pdo, 1, '2026-08-01', 'dinner', null);
        $items = expand_recipe_items(self::$pdo, 1, $recipeId);

        $ids = insert_meal_items(self::$pdo, 1, $mealId, $items, 'batch-uuid-1', 'カレーライス');
        // レシピ経由ではない単品追加(グループなし)
        $plainFood = resolve_food_source(self::$pdo, 1, 1, null);
        insert_meal_items(self::$pdo, 1, $mealId, [
            ['master_food_id' => 1, 'custom_food_id' => null, 'eating_out_meal_id' => null, 'quantity_g' => 10.0, 'food' => $plainFood],
        ], null, null);

        $this->assertCount(1, $ids);
        $deletedCount = delete_meal_item_group(self::$pdo, 1, 'batch-uuid-1');
        $this->assertSame(1, $deletedCount);

        $remaining = fetch_meals(self::$pdo, 1, null, null)[0]['items'];
        $this->assertCount(1, $remaining);
        $this->assertNull($remaining[0]['recipe_batch_id']);
    }

    // design.md §1.2: 他ユーザーのrecipe_batch_idを指定しても何も削除されない
    public function testDeleteMealItemGroupIsScopedPerUser(): void
    {
        $mealId = create_meal(self::$pdo, 1, '2026-08-01', 'dinner', null);
        $food = resolve_food_source(self::$pdo, 1, 1, null);
        insert_meal_items(self::$pdo, 1, $mealId, [
            ['master_food_id' => 1, 'custom_food_id' => null, 'eating_out_meal_id' => null, 'quantity_g' => 100.0, 'food' => $food],
        ], 'shared-batch-id', 'テスト');

        $deletedCount = delete_meal_item_group(self::$pdo, 2, 'shared-batch-id');

        $this->assertSame(0, $deletedCount);
        $this->assertCount(1, fetch_meals(self::$pdo, 1, null, null)[0]['items']);
    }

    // 2026-08-18追加: 直近の履歴で同じ日付・区分の食事を1枚のカードにまとめるため、
    // add_meal.phpはこの関数で既存の食事を探してから食材を追加する
    public function testFindMealByDateAndTypeReturnsExistingMeal(): void
    {
        $mealId = create_meal(self::$pdo, 1, '2026-08-01', 'breakfast', null);
        $found = find_meal_by_date_and_type(self::$pdo, 1, '2026-08-01', 'breakfast');
        $this->assertSame($mealId, $found['id']);
    }

    public function testFindMealByDateAndTypeReturnsNullWhenNoMatch(): void
    {
        create_meal(self::$pdo, 1, '2026-08-01', 'breakfast', null);
        $this->assertNull(find_meal_by_date_and_type(self::$pdo, 1, '2026-08-01', 'lunch'));
        $this->assertNull(find_meal_by_date_and_type(self::$pdo, 1, '2026-08-02', 'breakfast'));
        $this->assertNull(find_meal_by_date_and_type(self::$pdo, 2, '2026-08-01', 'breakfast'));
    }

    public function testDeleteMealCascadesToMealItems(): void
    {
        $mealId = create_meal(self::$pdo, 1, '2026-08-01', 'breakfast', null);
        $food = resolve_food_source(self::$pdo, 1, 1, null);
        insert_meal_items(self::$pdo, 1, $mealId, [
            ['master_food_id' => 1, 'custom_food_id' => null, 'eating_out_meal_id' => null, 'quantity_g' => 100.0, 'food' => $food],
        ], null, null);

        delete_meal(self::$pdo, $mealId);

        $this->assertNull(find_meal(self::$pdo, 1, $mealId));
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM meal_items WHERE meal_id = :id');
        $stmt->execute(['id' => $mealId]);
        $this->assertSame(0, (int) $stmt->fetchColumn());
    }

    // 2026-08-15追加: 食材・分量の編集(design.md §2.15)
    public function testUpdateMealItemReResolvesSnapshotAndQuantity(): void
    {
        $mealId = create_meal(self::$pdo, 1, '2026-08-01', 'breakfast', null);
        $food = resolve_food_source(self::$pdo, 1, 1, null);
        $ids = insert_meal_items(self::$pdo, 1, $mealId, [
            ['master_food_id' => 1, 'custom_food_id' => null, 'eating_out_meal_id' => null, 'quantity_g' => 100.0, 'food' => $food],
        ], null, null);

        // 食材(白米→にわとり むね)・分量を仮の値から直す
        update_meal_item(self::$pdo, 1, $ids[0], 2, null, 150.0);

        $items = fetch_meals(self::$pdo, 1, null, null)[0]['items'];
        $this->assertSame(2, $items[0]['master_food_id']);
        $this->assertStringContainsString('にわとり', $items[0]['food_name']);
        $this->assertSame(150.0, $items[0]['quantity_g']);
        $this->assertSame(105.0, $items[0]['kcal_per_100g']); // にわとり むねのkcal_per_100gを再解決している
    }

    public function testUpdateMealItemKeepsMealIdAndRecipeBatchId(): void
    {
        $mealId = create_meal(self::$pdo, 1, '2026-08-01', 'dinner', null);
        $food = resolve_food_source(self::$pdo, 1, 1, null);
        $ids = insert_meal_items(self::$pdo, 1, $mealId, [
            ['master_food_id' => 1, 'custom_food_id' => null, 'eating_out_meal_id' => null, 'quantity_g' => 200.0, 'food' => $food],
        ], 'batch-uuid-edit', 'カレーライス');

        update_meal_item(self::$pdo, 1, $ids[0], 1, null, 250.0);

        $items = fetch_meals(self::$pdo, 1, null, null)[0]['items'];
        $this->assertSame('batch-uuid-edit', $items[0]['recipe_batch_id']);
    }

    // 2026-08-15追加: 過去の記録の日付・体重の編集(design.md §2.6)
    public function testUpdateBodyWeightLogChangesDateAndWeight(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 68.5);
        $id = fetch_body_weight_logs(self::$pdo, 1, null, null)[0]['id'];

        $updated = update_body_weight_log(self::$pdo, 1, $id, '2026-08-02', 69.5);

        $this->assertTrue($updated);
        $logs = fetch_body_weight_logs(self::$pdo, 1, null, null);
        $this->assertSame('2026-08-02', $logs[0]['logged_date']);
        $this->assertSame(69.5, $logs[0]['weight']);
    }

    public function testUpdateBodyWeightLogReturnsFalseOnDuplicateDate(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 68.5);
        upsert_body_weight_log(self::$pdo, 1, '2026-08-02', 69.0);
        $idToEdit = fetch_body_weight_logs(self::$pdo, 1, null, null)[1]['id']; // 08-02の行

        // 08-02の記録を、既に08-01の記録がある日付に変更しようとする
        $updated = update_body_weight_log(self::$pdo, 1, $idToEdit, '2026-08-01', 70.0);

        $this->assertFalse($updated);
        // 元の日付・体重のまま変わっていないことを確認
        $logs = fetch_body_weight_logs(self::$pdo, 1, null, null);
        $this->assertSame(69.0, $logs[1]['weight']);
    }

    // 2026-08-15追加: 食事写真(design.md §2.18)。実ファイルI/Oを伴うprocess_and_save_meal_photo()
    // 自体はUnitテスト(ImageProcessingTest.php)で検証し、ここではDB更新の挙動だけを見る。
    public function testUpdateMealPhotoSetsAndClearsPhotoPath(): void
    {
        $mealId = create_meal(self::$pdo, 1, '2026-08-01', 'lunch', null);

        update_meal_photo(self::$pdo, $mealId, '1/photo-uuid.jpg');
        $meal = find_meal(self::$pdo, 1, $mealId);
        $this->assertSame('1/photo-uuid.jpg', $meal['photo_path']);

        update_meal_photo(self::$pdo, $mealId, null);
        $meal = find_meal(self::$pdo, 1, $mealId);
        $this->assertNull($meal['photo_path']);
    }

    // design.md §2.16: 身長・体重・生年月日・性別・活動レベルが揃うとBMI・TDEEが計算される
    public function testBuildNutritionSummaryComputesBmiAndTdeeWhenProfileComplete(): void
    {
        self::$pdo->exec(
            "UPDATE users SET height_cm = 175, activity_level = 'sedentary', birth_date = '1996-01-01', gender = 'male' WHERE id = 1"
        );
        upsert_body_weight_log(self::$pdo, 1, '2026-08-14', 70.0);

        $summary = build_nutrition_summary(self::$pdo, 1, '2026-08-14');

        $this->assertEqualsWithDelta(22.9, $summary['bmi'], 0.1);
        $this->assertSame('普通体重', $summary['bmi_category']);
        $this->assertNotNull($summary['tdee']);
        $this->assertNull($summary['goal']);
        $this->assertSame(0.0, $summary['today_kcal']);
    }

    // 食事タブのサマリー「本日の食事カロリー」用。$today以外の日付の食事は合算に含めない
    public function testBuildNutritionSummaryComputesTodayKcal(): void
    {
        $mealId = create_meal(self::$pdo, 1, '2026-08-14', 'lunch', null);
        insert_meal_items(self::$pdo, 1, $mealId, [
            ['master_food_id' => 1, 'custom_food_id' => null, 'eating_out_meal_id' => null, 'quantity_g' => 200.0,
             'food' => ['name' => '白米', 'kcal_per_100g' => 342.0, 'protein_g_per_100g' => 6.1, 'fat_g_per_100g' => 0.9, 'carb_g_per_100g' => 77.6]],
        ], null, null);
        $otherDayMealId = create_meal(self::$pdo, 1, '2026-08-13', 'dinner', null);
        insert_meal_items(self::$pdo, 1, $otherDayMealId, [
            ['master_food_id' => 1, 'custom_food_id' => null, 'eating_out_meal_id' => null, 'quantity_g' => 100.0,
             'food' => ['name' => '白米', 'kcal_per_100g' => 342.0, 'protein_g_per_100g' => 6.1, 'fat_g_per_100g' => 0.9, 'carb_g_per_100g' => 77.6]],
        ], null, null);

        $summary = build_nutrition_summary(self::$pdo, 1, '2026-08-14');

        // 342kcal/100g * 200g = 684kcal(前日分は含まれない)
        $this->assertSame(684.0, $summary['today_kcal']);
        // 6.1g/100g * 200g = 12.2g
        $this->assertSame(12.2, $summary['today_protein_g']);
        $this->assertSame(1.8, $summary['today_fat_g']);
        $this->assertSame(155.2, $summary['today_carb_g']);
    }

    public function testBuildNutritionSummaryOmitsBmiWithoutHeight(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 70.0);

        $summary = build_nutrition_summary(self::$pdo, 1, '2026-08-14');

        $this->assertNull($summary['bmi']);
        $this->assertNull($summary['tdee']);
    }

    // 実ブラウザ検証で判明: カスタムPFCモードは身長・活動レベル(TDEE)が未設定でも、
    // ユーザーが直接指定したグラム数をそのまま表示できるべき(TDEE計算に依存しない)
    public function testBuildNutritionSummaryCustomPfcWorksWithoutProfile(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 72.0);
        create_nutrition_goal(self::$pdo, 1, 68.0, '2026-11-01', 'custom', 150.0, 55.0, 200.0);

        $summary = build_nutrition_summary(self::$pdo, 1, '2026-08-14');

        $this->assertNull($summary['tdee']);
        $this->assertNotNull($summary['goal']);
        $this->assertSame(150.0, $summary['goal']['pfc']['protein_g']);
        $this->assertSame(55.0, $summary['goal']['pfc']['fat_g']);
        $this->assertSame(200.0, $summary['goal']['pfc']['carb_g']);
        // 150*4 + 55*9 + 200*4 = 600 + 495 + 800 = 1895
        $this->assertSame(1895.0, $summary['goal']['target_calories']);
    }

    // custom_ratio: standardと同じくTDEE(身長・活動レベル)が必要。目標カロリーを
    // ユーザー指定の比率で按分する(2026-08-16)
    public function testBuildNutritionSummaryCustomRatioConvertsPercentToGrams(): void
    {
        self::$pdo->exec(
            "UPDATE users SET height_cm = 175, activity_level = 'sedentary', birth_date = '1996-01-01', gender = 'male' WHERE id = 1"
        );
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 80.0);
        create_nutrition_goal(self::$pdo, 1, 70.0, '2026-12-01', 'custom_ratio', null, null, null, null, 20.0, 30.0, 50.0);

        $summary = build_nutrition_summary(self::$pdo, 1, '2026-08-14');

        $this->assertNotNull($summary['tdee']);
        $this->assertNotNull($summary['goal']);
        $this->assertNotNull($summary['goal']['target_calories']);
        // target_caloriesは表示用に整数へ丸めた値のため、内部計算(丸め前のカロリー)との
        // 誤差を吸収できるよう許容差を少し広めに取る
        $targetCalories = $summary['goal']['target_calories'];
        $this->assertEqualsWithDelta(round($targetCalories * 0.20 / 4, 1), $summary['goal']['pfc']['protein_g'], 0.2);
        $this->assertEqualsWithDelta(round($targetCalories * 0.30 / 9, 1), $summary['goal']['pfc']['fat_g'], 0.2);
        $this->assertEqualsWithDelta(round($targetCalories * 0.50 / 4, 1), $summary['goal']['pfc']['carb_g'], 0.2);
    }

    public function testBuildNutritionSummaryIncludesTargetBmiAndBodyFatPercentage(): void
    {
        self::$pdo->exec("UPDATE users SET height_cm = 175 WHERE id = 1");
        upsert_body_weight_log(self::$pdo, 1, '2026-08-14', 80.0, 22.0);
        create_nutrition_goal(self::$pdo, 1, 70.0, '2026-12-01', 'standard', null, null, null, 18.0);

        $summary = build_nutrition_summary(self::$pdo, 1, '2026-08-14');

        $this->assertSame(22.0, $summary['current_body_fat_percentage']);
        $this->assertNotNull($summary['goal']);
        // 70 / (1.75*1.75) = 22.857...
        $this->assertEqualsWithDelta(22.9, $summary['goal']['target_bmi'], 0.1);
        $this->assertSame('普通体重', $summary['goal']['target_bmi_category']);
        $this->assertSame(18.0, $summary['goal']['target_body_fat_percentage']);
    }

    public function testBuildNutritionSummaryIncludesGoalProgress(): void
    {
        self::$pdo->exec(
            "UPDATE users SET height_cm = 175, activity_level = 'sedentary', birth_date = '1996-01-01', gender = 'male' WHERE id = 1"
        );
        upsert_body_weight_log(self::$pdo, 1, '2026-07-01', 80.0);
        create_nutrition_goal(self::$pdo, 1, 70.0, '2026-12-01', 'standard', null, null, null);
        upsert_body_weight_log(self::$pdo, 1, '2026-08-14', 75.0);

        $summary = build_nutrition_summary(self::$pdo, 1, '2026-08-14');

        $this->assertNotNull($summary['goal']);
        $this->assertEqualsWithDelta(50.0, $summary['goal']['progress_percent'], 0.1);
        $this->assertFalse($summary['goal']['overdue']);
        $this->assertNotNull($summary['goal']['target_calories']);
        $this->assertNotNull($summary['goal']['pfc']);
    }

    public function testBuildNutritionSummaryFlagsOverdueGoal(): void
    {
        self::$pdo->exec(
            "UPDATE users SET height_cm = 175, activity_level = 'sedentary', birth_date = '1996-01-01', gender = 'male' WHERE id = 1"
        );
        upsert_body_weight_log(self::$pdo, 1, '2026-01-01', 80.0);
        create_nutrition_goal(self::$pdo, 1, 70.0, '2026-02-01', 'standard', null, null, null);
        upsert_body_weight_log(self::$pdo, 1, '2026-08-14', 78.0);

        $summary = build_nutrition_summary(self::$pdo, 1, '2026-08-14');

        $this->assertTrue($summary['goal']['overdue']);
        $this->assertNull($summary['goal']['target_calories']);
    }

    // 2026-08-20: プロフィールタブのサマリーの体重・BMI・体脂肪率表示は、運動・食事と揃えて
    // 「$todayちょうどの記録」だけを見る(記録の無い日はnull。「記録が無い日にも古い値が
    // 出るのは紛らわしい」との実機検証での指摘を受けて、当初のas-of仕様から変更)
    public function testBuildNutritionSummaryCurrentWeightOnlyReflectsExactDate(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 70.0);
        upsert_body_weight_log(self::$pdo, 1, '2026-08-20', 68.0);

        $noLogOnThatDay = build_nutrition_summary(self::$pdo, 1, '2026-08-10');
        $this->assertNull($noLogOnThatDay['current_weight']);

        $exactMatch = build_nutrition_summary(self::$pdo, 1, '2026-08-20');
        $this->assertSame(68.0, $exactMatch['current_weight']);
    }

    // BMR・TDEE・目標カロリーの計算は体重表示欄とは別に「直近で分かっている値」を使い続ける
    // (体重を毎日記録しなくても目標カロリーが消えないようにするため、意図的にfetch_body_weight_on_dateとは
    // 別のas-of取得を使っている。表示欄(current_weight・bmi)だけがnullになる)
    public function testBuildNutritionSummaryTdeeStillWorksWithoutExactDateWeightLog(): void
    {
        self::$pdo->exec(
            "UPDATE users SET height_cm = 175, activity_level = 'sedentary', birth_date = '1996-01-01', gender = 'male' WHERE id = 1"
        );
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 70.0);

        $summary = build_nutrition_summary(self::$pdo, 1, '2026-08-14');

        $this->assertNull($summary['current_weight']);
        $this->assertNull($summary['bmi']);
        $this->assertNotNull($summary['tdee']);
    }

    // ==== パスワードリセット ====

    public function testCreateAndFindValidResetToken(): void
    {
        $hash = hash('sha256', 'raw-token');
        $expiresAt = date('Y-m-d H:i:s', strtotime('+1 hour'));
        create_password_reset_token(self::$pdo, 1, $hash, $expiresAt);

        $found = find_valid_reset_token(self::$pdo, $hash);
        $this->assertSame(1, (int) $found['user_id']);
    }

    public function testFindValidResetTokenReturnsNullWhenExpired(): void
    {
        $hash = hash('sha256', 'raw-token');
        $expiresAt = date('Y-m-d H:i:s', strtotime('-1 hour'));
        create_password_reset_token(self::$pdo, 1, $hash, $expiresAt);

        $this->assertNull(find_valid_reset_token(self::$pdo, $hash));
    }

    public function testMarkResetTokenUsedPreventsReuse(): void
    {
        $hash = hash('sha256', 'raw-token');
        $expiresAt = date('Y-m-d H:i:s', strtotime('+1 hour'));
        create_password_reset_token(self::$pdo, 1, $hash, $expiresAt);
        $token = find_valid_reset_token(self::$pdo, $hash);

        mark_reset_token_used(self::$pdo, (int) $token['id']);

        $this->assertNull(find_valid_reset_token(self::$pdo, $hash));
    }

    /** @param array<int, array<string, mixed>> $board */
    private function findById(array $board, int $id): array
    {
        foreach ($board as $row) {
            if ($row['id'] === $id) {
                return $row;
            }
        }
        $this->fail("id={$id} not found in board");
    }
}
