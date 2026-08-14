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
        $board = fetch_board(self::$pdo, 1);
        $this->assertCount(3, $board);
    }

    // design.md §1.2: 他ユーザーのデータは一切見えないことを保証する重要なテスト
    public function testFetchBoardDoesNotLeakOtherUsersExercises(): void
    {
        $board = fetch_board(self::$pdo, 1);
        $ids = array_column($board, 'id');
        $this->assertNotContains(4, $ids);
    }

    public function testFetchBoardMarksWeightBasedByTarget(): void
    {
        $bench = $this->findById(fetch_board(self::$pdo, 1), 1);
        $this->assertTrue($bench['is_weight_based']);
    }

    public function testFetchBoardMarksWeightlessWhenNoTargetAndNoLogs(): void
    {
        $bike = $this->findById(fetch_board(self::$pdo, 1), 2);
        $this->assertFalse($bike['is_weight_based']);
    }

    // design.md §2.8: 廃止種目は目標重量が無くても、過去に重量ありの記録が1件でもあれば重量あり種目とみなす
    public function testFetchBoardMarksWeightBasedFromPastLogsEvenWithoutTarget(): void
    {
        self::$pdo->exec(
            "INSERT INTO logs (user_id, exercise_id, logged_date, set_number, weight, reps)
             VALUES (1, 3, '2026-01-01', 1, 10.0, 12)"
        );
        $discontinued = $this->findById(fetch_board(self::$pdo, 1), 3);
        $this->assertTrue($discontinued['is_weight_based']);
    }

    public function testFetchBoardCurrentIsEmptyWithoutLogs(): void
    {
        $bench = $this->findById(fetch_board(self::$pdo, 1), 1);
        $this->assertSame([], $bench['current']);
    }

    // design.md §2.9: 直近の記録日の(weight, reps)ごとにグルーピングする
    public function testFetchBoardCurrentReflectsLatestDateOnly(): void
    {
        self::$pdo->exec(
            "INSERT INTO logs (user_id, exercise_id, logged_date, set_number, weight, reps) VALUES
                (1, 1, '2026-01-01', 1, 60, 10),
                (1, 1, '2026-01-02', 1, 80, 12),
                (1, 1, '2026-01-02', 2, 80, 12)"
        );
        $bench = $this->findById(fetch_board(self::$pdo, 1), 1);
        $this->assertCount(1, $bench['current']);
        $this->assertSame(80.0, $bench['current'][0]['weight']);
        $this->assertSame(2, $bench['current'][0]['sets']);
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

    public function testDeleteBodyWeightLogRemovesRow(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 68.5);
        $id = fetch_body_weight_logs(self::$pdo, 1, null, null)[0]['id'];
        delete_body_weight_log(self::$pdo, $id);
        $this->assertCount(0, fetch_body_weight_logs(self::$pdo, 1, null, null));
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
            ['master_food_id' => 1, 'custom_food_id' => null, 'quantity_g' => 100.0,
             'food' => ['name' => '白米', 'kcal_per_100g' => 342.0, 'protein_g_per_100g' => 6.1, 'fat_g_per_100g' => 0.9, 'carb_g_per_100g' => 77.6]],
        ], null, null);
        create_nutrition_goal(self::$pdo, 1, 65.0, '2026-12-01', 'standard', null, null, null);

        delete_user_account(self::$pdo, 1);

        $this->assertNull(find_user_by_id(self::$pdo, 1));
        $this->assertCount(0, fetch_cycles(self::$pdo, 1));
        $this->assertCount(0, fetch_board(self::$pdo, 1));
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

    // design.md §2.15: meal_itemsは追加した瞬間の栄養値をスナップショットし、
    // 後からcustom_foodsの値を編集しても過去のログの計算結果は変わらない
    public function testInsertMealItemsSnapshotsNutritionAtTimeOfLogging(): void
    {
        $customFoodId = create_custom_food(self::$pdo, 1, '自家製プロテインバー', 400, 20, 10, 40);
        $mealId = create_meal(self::$pdo, 1, '2026-08-01', 'snack', null);
        $food = resolve_food_source(self::$pdo, 1, null, $customFoodId);
        insert_meal_items(self::$pdo, 1, $mealId, [
            ['master_food_id' => null, 'custom_food_id' => $customFoodId, 'quantity_g' => 50.0, 'food' => $food],
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
            ['master_food_id' => 1, 'custom_food_id' => null, 'quantity_g' => 10.0, 'food' => $plainFood],
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
            ['master_food_id' => 1, 'custom_food_id' => null, 'quantity_g' => 100.0, 'food' => $food],
        ], 'shared-batch-id', 'テスト');

        $deletedCount = delete_meal_item_group(self::$pdo, 2, 'shared-batch-id');

        $this->assertSame(0, $deletedCount);
        $this->assertCount(1, fetch_meals(self::$pdo, 1, null, null)[0]['items']);
    }

    public function testDeleteMealCascadesToMealItems(): void
    {
        $mealId = create_meal(self::$pdo, 1, '2026-08-01', 'breakfast', null);
        $food = resolve_food_source(self::$pdo, 1, 1, null);
        insert_meal_items(self::$pdo, 1, $mealId, [
            ['master_food_id' => 1, 'custom_food_id' => null, 'quantity_g' => 100.0, 'food' => $food],
        ], null, null);

        delete_meal(self::$pdo, $mealId);

        $this->assertNull(find_meal(self::$pdo, 1, $mealId));
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM meal_items WHERE meal_id = :id');
        $stmt->execute(['id' => $mealId]);
        $this->assertSame(0, (int) $stmt->fetchColumn());
    }

    // design.md §2.16: 身長・体重・生年月日・性別・活動レベルが揃うとBMI・TDEEが計算される
    public function testBuildNutritionSummaryComputesBmiAndTdeeWhenProfileComplete(): void
    {
        self::$pdo->exec(
            "UPDATE users SET height_cm = 175, activity_level = 'sedentary', birth_date = '1996-01-01', gender = 'male' WHERE id = 1"
        );
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 70.0);

        $summary = build_nutrition_summary(self::$pdo, 1, '2026-08-14');

        $this->assertEqualsWithDelta(22.9, $summary['bmi'], 0.1);
        $this->assertSame('普通体重', $summary['bmi_category']);
        $this->assertNotNull($summary['tdee']);
        $this->assertNull($summary['goal']);
    }

    public function testBuildNutritionSummaryOmitsBmiWithoutHeight(): void
    {
        upsert_body_weight_log(self::$pdo, 1, '2026-08-01', 70.0);

        $summary = build_nutrition_summary(self::$pdo, 1, '2026-08-14');

        $this->assertNull($summary['bmi']);
        $this->assertNull($summary['tdee']);
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
