<?php
// design.md §2「データモデル」§1.2「データ分離の方針」に対応する共通クエリ群。
// api/auth・api の両方から require して使う(コピペで二重管理にしない)。
// user_idを扱う全ての関数は、呼び出し側(各エンドポイント)がrequire_login()で得た
// ログイン中のuser_idを渡す前提とし、ここでは受け取ったuser_idをそのままWHERE句に使う。

// design.md §2.8: 目標重量が設定されているか、過去に重量ありの記録が1件でもあれば「重量あり種目」。
// fetch_board()とis_weightless()の両方で使うSQL式なので定数化してコピペを避ける。
const IS_WEIGHT_BASED_SQL = "(e.target_weight IS NOT NULL
    OR EXISTS (SELECT 1 FROM logs l WHERE l.exercise_id = e.id AND l.weight IS NOT NULL)
)";

// ==== ユーザー ====

function find_user_by_email(PDO $pdo, string $email): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM users WHERE email = :email');
    $stmt->execute(['email' => $email]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function find_user_by_google_sub(PDO $pdo, string $googleSub): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM users WHERE google_sub = :sub');
    $stmt->execute(['sub' => $googleSub]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function find_user_by_id(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = :id');
    $stmt->execute(['id' => $id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function create_user_with_password(PDO $pdo, string $email, string $passwordHash, string $displayName): int
{
    $stmt = $pdo->prepare(
        'INSERT INTO users (email, password_hash, display_name) VALUES (:email, :password_hash, :display_name)'
    );
    $stmt->execute(['email' => $email, 'password_hash' => $passwordHash, 'display_name' => $displayName]);
    return (int) $pdo->lastInsertId();
}

function create_user_with_google(PDO $pdo, string $googleSub, ?string $email, string $displayName): int
{
    $stmt = $pdo->prepare(
        'INSERT INTO users (google_sub, email, display_name) VALUES (:sub, :email, :display_name)'
    );
    $stmt->execute(['sub' => $googleSub, 'email' => $email, 'display_name' => $displayName]);
    return (int) $pdo->lastInsertId();
}

// design.md §2.1: 同じメールアドレスのメール/パスワードアカウントが既にある場合に、
// Googleログインをそのアカウントへ紐づける(google_callback.php参照)。
// email_verifiedがtrueのGoogleアカウントに限って呼び出すこと(呼び出し側の責務)。
function link_google_to_user(PDO $pdo, int $userId, string $googleSub): void
{
    $stmt = $pdo->prepare('UPDATE users SET google_sub = :sub WHERE id = :id');
    $stmt->execute(['sub' => $googleSub, 'id' => $userId]);
}

// design.md §1.1「レート制限」: 直近15分以内に5回以上失敗していればロック中とみなす
function is_login_locked(array $user): bool
{
    if ((int) $user['failed_login_count'] < 5 || $user['failed_login_at'] === null) {
        return false;
    }
    $failedAt = new DateTimeImmutable($user['failed_login_at']);
    $unlockAt = $failedAt->modify('+15 minutes');
    return $unlockAt > new DateTimeImmutable();
}

function record_login_failure(PDO $pdo, int $userId): void
{
    $stmt = $pdo->prepare(
        'UPDATE users SET failed_login_count = failed_login_count + 1, failed_login_at = NOW() WHERE id = :id'
    );
    $stmt->execute(['id' => $userId]);
}

function reset_login_failure(PDO $pdo, int $userId): void
{
    $stmt = $pdo->prepare('UPDATE users SET failed_login_count = 0, failed_login_at = NULL WHERE id = :id');
    $stmt->execute(['id' => $userId]);
}

function update_user_profile(PDO $pdo, int $userId, string $displayName, ?string $birthDate, string $gender): void
{
    $stmt = $pdo->prepare(
        'UPDATE users SET display_name = :display_name, birth_date = :birth_date, gender = :gender WHERE id = :id'
    );
    $stmt->execute([
        'display_name' => $displayName,
        'birth_date' => $birthDate,
        'gender' => $gender,
        'id' => $userId,
    ]);
}

function update_user_password(PDO $pdo, int $userId, string $passwordHash): void
{
    $stmt = $pdo->prepare('UPDATE users SET password_hash = :password_hash WHERE id = :id');
    $stmt->execute(['password_hash' => $passwordHash, 'id' => $userId]);
}

// design.md §1.3: ON DELETE CASCADEに頼らず、依存関係の順に1トランザクション内で明示的に削除する
function delete_user_account(PDO $pdo, int $userId): void
{
    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM logs WHERE user_id = :id')->execute(['id' => $userId]);
        $pdo->prepare('DELETE FROM body_weight_logs WHERE user_id = :id')->execute(['id' => $userId]);
        $pdo->prepare('DELETE FROM exercises WHERE user_id = :id')->execute(['id' => $userId]);
        $pdo->prepare('DELETE FROM cycles WHERE user_id = :id')->execute(['id' => $userId]);
        $pdo->prepare('DELETE FROM users WHERE id = :id')->execute(['id' => $userId]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

// ==== パスワードリセット ====

function create_password_reset_token(PDO $pdo, int $userId, string $tokenHash, string $expiresAt): void
{
    $stmt = $pdo->prepare(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (:user_id, :token_hash, :expires_at)'
    );
    $stmt->execute(['user_id' => $userId, 'token_hash' => $tokenHash, 'expires_at' => $expiresAt]);
}

function find_valid_reset_token(PDO $pdo, string $tokenHash): ?array
{
    $stmt = $pdo->prepare(
        'SELECT * FROM password_reset_tokens
         WHERE token_hash = :token_hash AND used_at IS NULL AND expires_at > NOW()'
    );
    $stmt->execute(['token_hash' => $tokenHash]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function mark_reset_token_used(PDO $pdo, int $tokenId): void
{
    $stmt = $pdo->prepare('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = :id');
    $stmt->execute(['id' => $tokenId]);
}

// ==== サイクル ====

function fetch_cycles(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare('SELECT id, label FROM cycles WHERE user_id = :user_id ORDER BY id');
    $stmt->execute(['user_id' => $userId]);
    return array_map(function ($r) {
        return ['id' => (int) $r['id'], 'label' => $r['label']];
    }, $stmt->fetchAll());
}

function find_cycle(PDO $pdo, int $userId, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT id, label FROM cycles WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function cycle_label_exists(PDO $pdo, int $userId, string $label): bool
{
    $stmt = $pdo->prepare('SELECT 1 FROM cycles WHERE user_id = :user_id AND label = :label');
    $stmt->execute(['user_id' => $userId, 'label' => $label]);
    return (bool) $stmt->fetchColumn();
}

function create_cycle(PDO $pdo, int $userId, string $label): int
{
    $stmt = $pdo->prepare('INSERT INTO cycles (user_id, label) VALUES (:user_id, :label)');
    $stmt->execute(['user_id' => $userId, 'label' => $label]);
    return (int) $pdo->lastInsertId();
}

function update_cycle_label(PDO $pdo, int $id, string $label): void
{
    $stmt = $pdo->prepare('UPDATE cycles SET label = :label WHERE id = :id');
    $stmt->execute(['label' => $label, 'id' => $id]);
}

function cycle_has_exercises(PDO $pdo, int $cycleId): bool
{
    $stmt = $pdo->prepare('SELECT 1 FROM exercises WHERE cycle_id = :id LIMIT 1');
    $stmt->execute(['id' => $cycleId]);
    return (bool) $stmt->fetchColumn();
}

function delete_cycle(PDO $pdo, int $id): void
{
    $stmt = $pdo->prepare('DELETE FROM cycles WHERE id = :id');
    $stmt->execute(['id' => $id]);
}

// ==== 管理表・記録(ユーザーごと) ====

function fetch_board(PDO $pdo, int $userId): array
{
    $exercisesStmt = $pdo->prepare(
        "SELECT
            e.id, e.cycle_id, c.label AS cycle_label, e.is_discontinued, e.name,
            e.target_weight, e.target_reps, e.target_sets,
            " . IS_WEIGHT_BASED_SQL . " AS is_weight_based
        FROM exercises e
        JOIN cycles c ON c.id = e.cycle_id
        WHERE e.user_id = :user_id
        ORDER BY e.cycle_id, e.is_discontinued, e.id"
    );
    $exercisesStmt->execute(['user_id' => $userId]);
    $exercises = $exercisesStmt->fetchAll();

    // design.md §2.9: 直近の記録日の(重量,回数)グループを、ログイン中のユーザーの全種目分まとめて取得する
    // PDO::ATTR_EMULATE_PREPARES=falseのネイティブプリペアドステートメントは同名プレースホルダーの
    // 再利用をサポートしないため、同じ値でも:user_id1/:user_id2のように名前を分ける
    $currentStmt = $pdo->prepare(
        "SELECT l.exercise_id, l.weight, l.reps, COUNT(*) AS sets
        FROM logs l
        INNER JOIN (
            SELECT exercise_id, MAX(logged_date) AS max_date FROM logs WHERE user_id = :user_id1 GROUP BY exercise_id
        ) latest ON latest.exercise_id = l.exercise_id AND latest.max_date = l.logged_date
        WHERE l.user_id = :user_id2
        GROUP BY l.exercise_id, l.weight, l.reps
        ORDER BY l.exercise_id, l.weight DESC, l.reps DESC"
    );
    $currentStmt->execute(['user_id1' => $userId, 'user_id2' => $userId]);

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
    $stmt = $pdo->prepare('SELECT id, cycle_id, name FROM exercises WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
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

// ==== 体重の推移 ====

function fetch_body_weight_logs(PDO $pdo, int $userId, ?string $dateFrom, ?string $dateTo): array
{
    $sql = 'SELECT id, logged_date, weight FROM body_weight_logs WHERE user_id = :user_id';
    $params = ['user_id' => $userId];
    if ($dateFrom !== null) {
        $sql .= ' AND logged_date >= :date_from';
        $params['date_from'] = $dateFrom;
    }
    if ($dateTo !== null) {
        $sql .= ' AND logged_date <= :date_to';
        $params['date_to'] = $dateTo;
    }
    $sql .= ' ORDER BY logged_date';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    return array_map(function ($r) {
        return [
            'id' => (int) $r['id'],
            'logged_date' => $r['logged_date'],
            'weight' => (float) $r['weight'],
        ];
    }, $stmt->fetchAll());
}

// design.md §2.6: 同じ日に再送信した場合は既存行を上書きする
function upsert_body_weight_log(PDO $pdo, int $userId, string $loggedDate, float $weight): void
{
    $stmt = $pdo->prepare(
        'INSERT INTO body_weight_logs (user_id, logged_date, weight) VALUES (:user_id, :logged_date, :weight)
         ON DUPLICATE KEY UPDATE weight = VALUES(weight)'
    );
    $stmt->execute(['user_id' => $userId, 'logged_date' => $loggedDate, 'weight' => $weight]);
}

function find_body_weight_log(PDO $pdo, int $userId, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT id FROM body_weight_logs WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function delete_body_weight_log(PDO $pdo, int $id): void
{
    $stmt = $pdo->prepare('DELETE FROM body_weight_logs WHERE id = :id');
    $stmt->execute(['id' => $id]);
}

// ==== エクスポート(US-17) ====

function fetch_logs_for_export(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare(
        'SELECT l.logged_date, c.label AS cycle_label, e.name AS exercise_name, l.set_number, l.weight, l.reps
        FROM logs l
        JOIN exercises e ON e.id = l.exercise_id
        JOIN cycles c ON c.id = e.cycle_id
        WHERE l.user_id = :user_id
        ORDER BY l.logged_date, l.id'
    );
    $stmt->execute(['user_id' => $userId]);
    return $stmt->fetchAll();
}

function fetch_body_weight_logs_for_export(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare(
        'SELECT logged_date, weight FROM body_weight_logs WHERE user_id = :user_id ORDER BY logged_date'
    );
    $stmt->execute(['user_id' => $userId]);
    return $stmt->fetchAll();
}
