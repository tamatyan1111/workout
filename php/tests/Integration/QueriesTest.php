<?php

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\TestCase;

// design.md §2.5・§2.4 のロジック(現在値の計算、重量あり種目判定)を実DBに対して検証する。
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
        self::$pdo->exec('TRUNCATE TABLE exercises');
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

        self::$pdo->exec(
            "INSERT INTO exercises (id, cycle_id, is_discontinued, name, target_weight, target_reps, target_sets)
             VALUES
               (1, 1, 0, 'ベンチプレス', 80, 12, 3),
               (2, 1, 0, 'エアロバイク', NULL, 20, 1),
               (3, 1, 1, '廃止種目', NULL, NULL, NULL)"
        );
    }

    public function testFetchBoardReturnsAllExercises(): void
    {
        $board = fetch_board(self::$pdo);
        $this->assertCount(3, $board);
    }

    public function testFetchBoardMarksWeightBasedByTarget(): void
    {
        $bench = $this->findById(fetch_board(self::$pdo), 1);
        $this->assertTrue($bench['is_weight_based']);
    }

    public function testFetchBoardMarksWeightlessWhenNoTargetAndNoLogs(): void
    {
        $bike = $this->findById(fetch_board(self::$pdo), 2);
        $this->assertFalse($bike['is_weight_based']);
    }

    // design.md §2.4: 廃止種目は目標重量が無くても、過去に重量ありの記録が1件でもあれば重量あり種目とみなす
    public function testFetchBoardMarksWeightBasedFromPastLogsEvenWithoutTarget(): void
    {
        self::$pdo->exec(
            "INSERT INTO logs (exercise_id, logged_date, set_number, weight, reps)
             VALUES (3, '2026-01-01', 1, 10.0, 12)"
        );
        $discontinued = $this->findById(fetch_board(self::$pdo), 3);
        $this->assertTrue($discontinued['is_weight_based']);
    }

    public function testFetchBoardCurrentIsEmptyWithoutLogs(): void
    {
        $bench = $this->findById(fetch_board(self::$pdo), 1);
        $this->assertSame([], $bench['current']);
    }

    // design.md §2.5: 直近の記録日の(weight, reps)ごとにグルーピングする
    public function testFetchBoardCurrentReflectsLatestDateOnly(): void
    {
        self::$pdo->exec(
            "INSERT INTO logs (exercise_id, logged_date, set_number, weight, reps) VALUES
                (1, '2026-01-01', 1, 60, 10),
                (1, '2026-01-02', 1, 80, 12),
                (1, '2026-01-02', 2, 80, 12)"
        );
        $bench = $this->findById(fetch_board(self::$pdo), 1);
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
            "INSERT INTO logs (exercise_id, logged_date, set_number, weight, reps)
             VALUES (1, '2026-01-01', 1, 60, 10)"
        );
        $this->assertTrue(exercise_has_logs(self::$pdo, 1));
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
