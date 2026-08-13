<?php
// design.md §2.5・§2.6 に対応する共通クエリ群。
// 公開API・秘密パスAPIの両方から require して使う(コピペで二重管理にしない)。

// design.md §2.4: 目標重量が設定されているか、過去に重量ありの記録が1件でもあれば「重量あり種目」。
// fetch_board()とis_weightless()の両方で使うSQL式なので定数化してコピペを避ける。
const IS_WEIGHT_BASED_SQL = "(e.target_weight IS NOT NULL
    OR EXISTS (SELECT 1 FROM logs l WHERE l.exercise_id = e.id AND l.weight IS NOT NULL)
)";

function fetch_board(PDO $pdo): array
{
    $exercisesStmt = $pdo->query(
        "SELECT
            e.id, e.cycle_id, c.label AS cycle_label, e.is_discontinued, e.name,
            e.target_weight, e.target_reps, e.target_sets,
            " . IS_WEIGHT_BASED_SQL . " AS is_weight_based
        FROM exercises e
        JOIN cycles c ON c.id = e.cycle_id
        ORDER BY e.cycle_id, e.is_discontinued, e.id"
    );
    $exercises = $exercisesStmt->fetchAll();

    // design.md §2.5: 直近の記録日の(重量,回数)グループを全種目分まとめて取得する
    $currentStmt = $pdo->query(
        "SELECT l.exercise_id, l.weight, l.reps, COUNT(*) AS sets
        FROM logs l
        INNER JOIN (
            SELECT exercise_id, MAX(logged_date) AS max_date FROM logs GROUP BY exercise_id
        ) latest ON latest.exercise_id = l.exercise_id AND latest.max_date = l.logged_date
        GROUP BY l.exercise_id, l.weight, l.reps
        ORDER BY l.exercise_id, l.weight DESC, l.reps DESC"
    );

    $currentByExercise = [];
    foreach ($currentStmt->fetchAll() as $row) {
        $currentByExercise[(int) $row['exercise_id']][] = [
            'weight' => $row['weight'] !== null ? (float) $row['weight'] : null,
            'reps' => (int) $row['reps'],
            'sets' => (int) $row['sets'],
        ];
    }

    return array_map(function ($e) use ($currentByExercise) {
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
        ];
    }, $exercises);
}

function fetch_logs(PDO $pdo, ?int $exerciseId, ?string $dateFrom, ?string $dateTo): array
{
    $sql = 'SELECT id, exercise_id, logged_date, set_number, weight, reps FROM logs WHERE 1=1';
    $params = [];
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

function fetch_recent_logs(PDO $pdo, int $limit): array
{
    $stmt = $pdo->prepare(
        'SELECT l.id, l.exercise_id, e.name AS exercise_name, e.cycle_id,
                l.logged_date, l.set_number, l.weight, l.reps
        FROM logs l
        JOIN exercises e ON e.id = l.exercise_id
        ORDER BY l.logged_date DESC, l.id DESC
        LIMIT :limit'
    );
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

function find_exercise(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT id, cycle_id, name FROM exercises WHERE id = :id');
    $stmt->execute(['id' => $id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function find_log(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT id, exercise_id, logged_date, set_number, weight, reps FROM logs WHERE id = :id');
    $stmt->execute(['id' => $id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

// design.md §2.4: 目標重量が無くても、過去に重量ありの記録があれば「重量あり種目」とみなす
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
