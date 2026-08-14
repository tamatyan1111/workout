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

        delete_user_account(self::$pdo, 1);

        $this->assertNull(find_user_by_id(self::$pdo, 1));
        $this->assertCount(0, fetch_cycles(self::$pdo, 1));
        $this->assertCount(0, fetch_board(self::$pdo, 1));
        $this->assertCount(0, fetch_body_weight_logs(self::$pdo, 1, null, null));
        // ユーザー2のデータは影響を受けない
        $this->assertNotNull(find_user_by_id(self::$pdo, 2));
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
