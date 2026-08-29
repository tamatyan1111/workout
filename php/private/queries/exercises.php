<?php

// design.md §2.8: 目標重量が設定されているか、過去に重量ありの記録が1件でもあれば「重量あり種目」。
// fetch_board()とis_weightless()の両方で使うSQL式なので定数化してコピペを避ける。
const IS_WEIGHT_BASED_SQL = "(e.target_weight IS NOT NULL
    OR EXISTS (SELECT 1 FROM logs l WHERE l.exercise_id = e.id AND l.weight IS NOT NULL)
)";

// ==== 管理表・記録(ユーザーごと) ====

// $dateに記録したセットだけを「現在」列に載せる(2026-08-20、サマリーに日付ナビを
// 追加したのに合わせて、「種目ごとの最終記録日」ではなく「指定日の記録」に変更)。
function fetch_board(PDO $pdo, int $userId, string $date): array
{
    $exercisesStmt = $pdo->prepare(
        "SELECT
            e.id, e.cycle_id, c.label AS cycle_label, e.is_discontinued, e.name,
            e.target_weight, e.target_reps, e.target_sets,
            " . IS_WEIGHT_BASED_SQL . " AS is_weight_based
        FROM exercises e
        JOIN cycles c ON c.id = e.cycle_id
        WHERE e.user_id = :user_id
        ORDER BY e.cycle_id, e.is_discontinued, e.sort_order, e.id"
    );
    $exercisesStmt->execute(['user_id' => $userId]);
    $exercises = $exercisesStmt->fetchAll();

    $currentStmt = $pdo->prepare(
        "SELECT l.exercise_id, l.weight, l.reps, COUNT(*) AS sets
        FROM logs l
        WHERE l.user_id = :user_id AND l.logged_date = :date
        GROUP BY l.exercise_id, l.weight, l.reps
        ORDER BY l.exercise_id, l.weight DESC, l.reps DESC"
    );
    $currentStmt->execute(['user_id' => $userId, 'date' => $date]);
    $currentByExercise = group_log_rows_by_exercise($currentStmt->fetchAll());

    // 「運動を記録」フォームの初期値(前回やった重量・回数)用(2026-08-20)。サマリーの「現在」
    // (指定日ちょうどの記録)とは意図的に別物: その日まだ何も記録していなくても、種目ごとの
    // 直近の記録日の内容を初期値にできるようにする。
    // PDO::ATTR_EMULATE_PREPARES=falseのネイティブプリペアドステートメントは同名プレースホルダーの
    // 再利用をサポートしないため、同じ値でも:user_id1/:user_id2のように名前を分ける
    $latestStmt = $pdo->prepare(
        "SELECT l.exercise_id, l.weight, l.reps, COUNT(*) AS sets
        FROM logs l
        INNER JOIN (
            SELECT exercise_id, MAX(logged_date) AS max_date FROM logs WHERE user_id = :user_id1 GROUP BY exercise_id
        ) latest ON latest.exercise_id = l.exercise_id AND latest.max_date = l.logged_date
        WHERE l.user_id = :user_id2
        GROUP BY l.exercise_id, l.weight, l.reps
        ORDER BY l.exercise_id, l.weight DESC, l.reps DESC"
    );
    $latestStmt->execute(['user_id1' => $userId, 'user_id2' => $userId]);
    $latestByExercise = group_log_rows_by_exercise($latestStmt->fetchAll());

    return array_map(function ($e) use ($currentByExercise, $latestByExercise) {
        return [
            'id' => (int) $e['id'],
            'cycle' => ['id' => (int) $e['cycle_id'], 'label' => $e['cycle_label']],
            'is_discontinued' => (bool) $e['is_discontinued'],
            'name' => $e['name'],
            'is_weight_based' => (bool) $e['is_weight_based'],
            'target' => [
                'weight' => $e['target_weight'] !== null ? (float) $e['target_weight'] : null,
                'reps' => $e['target_reps'] !== null ? (int) $e['target_reps'] : null,
                'sets' => $e['target_sets'] !== null ? (int) $e['target_sets'] : null,
            ],
            'current' => $currentByExercise[(int) $e['id']] ?? [],
            'latest' => $latestByExercise[(int) $e['id']] ?? [],
        ];
    }, $exercises);
}

function group_log_rows_by_exercise(array $rows): array
{
    $byExercise = [];
    foreach ($rows as $row) {
        $byExercise[(int) $row['exercise_id']][] = [
            'weight' => $row['weight'] !== null ? (float) $row['weight'] : null,
            'reps' => (int) $row['reps'],
            'sets' => (int) $row['sets'],
        ];
    }
    return $byExercise;
}

function fetch_logs(PDO $pdo, int $userId, ?int $exerciseId, ?string $dateFrom, ?string $dateTo): array
{
    $sql = 'SELECT id, exercise_id, logged_date, set_number, weight, reps FROM logs WHERE user_id = :user_id';
    $params = ['user_id' => $userId];
    if ($exerciseId !== null) {
        $sql .= ' AND exercise_id = :exercise_id';
        $params['exercise_id'] = $exerciseId;
    }
    if ($dateFrom !== null) {
        $sql .= ' AND logged_date >= :date_from';
        $params['date_from'] = $dateFrom;
    }
    if ($dateTo !== null) {
        $sql .= ' AND logged_date <= :date_to';
        $params['date_to'] = $dateTo;
    }
    $sql .= ' ORDER BY logged_date, id';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    return array_map(function ($r) {
        return [
            'id' => (int) $r['id'],
            'exercise_id' => (int) $r['exercise_id'],
            'logged_date' => $r['logged_date'],
            'set_number' => (int) $r['set_number'],
            'weight' => $r['weight'] !== null ? (float) $r['weight'] : null,
            'reps' => (int) $r['reps'],
        ];
    }, $stmt->fetchAll());
}

function fetch_recent_logs(PDO $pdo, int $userId, int $limit): array
{
    $stmt = $pdo->prepare(
        'SELECT l.id, l.exercise_id, e.name AS exercise_name, e.cycle_id,
                l.logged_date, l.set_number, l.weight, l.reps
        FROM logs l
        JOIN exercises e ON e.id = l.exercise_id
        WHERE l.user_id = :user_id
        ORDER BY l.logged_date DESC, l.id DESC
        LIMIT :limit'
    );
    $stmt->bindValue(':user_id', $userId, PDO::PARAM_INT);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();

    return array_map(function ($r) {
        return [
            'id' => (int) $r['id'],
            'exercise_id' => (int) $r['exercise_id'],
            'exercise_name' => $r['exercise_name'],
            'cycle_id' => $r['cycle_id'] !== null ? (int) $r['cycle_id'] : null,
            'logged_date' => $r['logged_date'],
            'set_number' => (int) $r['set_number'],
            'weight' => $r['weight'] !== null ? (float) $r['weight'] : null,
            'reps' => (int) $r['reps'],
        ];
    }, $stmt->fetchAll());
}

function find_exercise(PDO $pdo, int $userId, int $id): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, cycle_id, name, is_discontinued, sort_order FROM exercises WHERE id = :id AND user_id = :user_id'
    );
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

// 種目を追加するときの初期sort_order(そのサイクルの末尾に追加、2026-08-21)
function next_exercise_sort_order(PDO $pdo, int $cycleId): int
{
    $stmt = $pdo->prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM exercises WHERE cycle_id = :cycle_id');
    $stmt->execute(['cycle_id' => $cycleId]);
    return (int) $stmt->fetchColumn();
}

// 種目管理画面のドラッグ&ドロップ並べ替え用(2026-08-26)。以前は隣接swap方式の
// move_exercise(▲▼ボタン)だったが、D&Dへの変更に伴い置き換えた。ドラッグで複数段
// 動かすと何度も呼ぶ必要がある隣接swapと違い、ドロップ後の並び順を1回で反映する。
// $orderedIdsは同じサイクル・同じ廃止状態の種目グループを並べ替えた後のid配列。
// グループの構成(件数・所属)が一致しない場合は何もしない(不正な呼び出し・競合状態への対処)。
function reorder_exercises(PDO $pdo, int $userId, int $cycleId, bool $isDiscontinued, array $orderedIds): void
{
    $siblingsStmt = $pdo->prepare(
        'SELECT id FROM exercises WHERE user_id = :user_id AND cycle_id = :cycle_id AND is_discontinued = :is_discontinued'
    );
    $siblingsStmt->execute(['user_id' => $userId, 'cycle_id' => $cycleId, 'is_discontinued' => $isDiscontinued]);
    $siblingIds = array_map('intval', array_column($siblingsStmt->fetchAll(), 'id'));

    sort($siblingIds);
    $sortedOrderedIds = array_map('intval', $orderedIds);
    sort($sortedOrderedIds);
    if ($siblingIds !== $sortedOrderedIds) {
        return;
    }

    $updateStmt = $pdo->prepare('UPDATE exercises SET sort_order = :sort_order WHERE id = :id AND user_id = :user_id');
    $pdo->beginTransaction();
    foreach ($orderedIds as $index => $id) {
        $updateStmt->execute(['sort_order' => $index, 'id' => (int) $id, 'user_id' => $userId]);
    }
    $pdo->commit();
}

function find_log(PDO $pdo, int $userId, int $id): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, exercise_id, logged_date, set_number, weight, reps FROM logs WHERE id = :id AND user_id = :user_id'
    );
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

// design.md §2.8: 目標重量が無くても、過去に重量ありの記録があれば「重量あり種目」とみなす
// (呼び出し側でfind_exercise等によりexerciseがuser本人のものであることを確認済みの前提)
function is_weightless(PDO $pdo, int $exerciseId): bool
{
    $stmt = $pdo->prepare(
        "SELECT " . IS_WEIGHT_BASED_SQL . " AS is_weight_based
        FROM exercises e WHERE e.id = :id"
    );
    $stmt->execute(['id' => $exerciseId]);
    $row = $stmt->fetch();
    if (!$row) {
        json_error('種目が見つかりません', 404);
    }
    return !((bool) $row['is_weight_based']);
}

function exercise_has_logs(PDO $pdo, int $exerciseId): bool
{
    $stmt = $pdo->prepare('SELECT 1 FROM logs WHERE exercise_id = :id LIMIT 1');
    $stmt->execute(['id' => $exerciseId]);
    return (bool) $stmt->fetchColumn();
}
