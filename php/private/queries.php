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
// PHPの実行時タイムゾーンとDBサーバーのタイムゾーンが食い違うと、PHP側の相対時刻計算とDB側の
// NOW()が指す実時刻がずれてしまう(実際にローカル環境でこのズレによりパスワードリセットが
// 常に「期限切れ」判定になる不具合が見つかった)。両者を必ずUTCに揃えることで、サーバーの
// ロケール設定に依存しないようにする。
function is_login_locked(array $user): bool
{
    if ((int) $user['failed_login_count'] < 5 || $user['failed_login_at'] === null) {
        return false;
    }
    $failedAt = new DateTimeImmutable($user['failed_login_at'], new DateTimeZone('UTC'));
    $unlockAt = $failedAt->modify('+15 minutes');
    return $unlockAt > new DateTimeImmutable('now', new DateTimeZone('UTC'));
}

function record_login_failure(PDO $pdo, int $userId): void
{
    $stmt = $pdo->prepare(
        'UPDATE users SET failed_login_count = failed_login_count + 1, failed_login_at = UTC_TIMESTAMP() WHERE id = :id'
    );
    $stmt->execute(['id' => $userId]);
}

function reset_login_failure(PDO $pdo, int $userId): void
{
    $stmt = $pdo->prepare('UPDATE users SET failed_login_count = 0, failed_login_at = NULL WHERE id = :id');
    $stmt->execute(['id' => $userId]);
}

// height_cm・activity_levelはUS-14の拡張(§7対応、design.md §2.1参照)
function update_user_profile(
    PDO $pdo,
    int $userId,
    string $displayName,
    ?string $birthDate,
    string $gender,
    ?int $heightCm,
    ?string $activityLevel
): void {
    $stmt = $pdo->prepare(
        'UPDATE users SET display_name = :display_name, birth_date = :birth_date, gender = :gender,
            height_cm = :height_cm, activity_level = :activity_level WHERE id = :id'
    );
    $stmt->execute([
        'display_name' => $displayName,
        'birth_date' => $birthDate,
        'gender' => $gender,
        'height_cm' => $heightCm,
        'activity_level' => $activityLevel,
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
        // 食事記録機能(§7)分。meal_items/recipe_itemsは親のON DELETE CASCADEで連動削除されるが、
        // §1.3の方針(監査しやすさ)にならい明示的に削除する。custom_foodsはrecipe_itemsからの
        // 参照(既定でON DELETE RESTRICT)が残っていると削除できないため、recipe_itemsの後に置く
        $pdo->prepare('DELETE FROM meal_items WHERE user_id = :id')->execute(['id' => $userId]);
        $pdo->prepare('DELETE FROM meals WHERE user_id = :id')->execute(['id' => $userId]);
        $pdo->prepare('DELETE FROM recipe_items WHERE user_id = :id')->execute(['id' => $userId]);
        $pdo->prepare('DELETE FROM recipes WHERE user_id = :id')->execute(['id' => $userId]);
        $pdo->prepare('DELETE FROM custom_foods WHERE user_id = :id')->execute(['id' => $userId]);
        $pdo->prepare('DELETE FROM nutrition_goals WHERE user_id = :id')->execute(['id' => $userId]);

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
         WHERE token_hash = :token_hash AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()'
    );
    $stmt->execute(['token_hash' => $tokenHash]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function mark_reset_token_used(PDO $pdo, int $tokenId): void
{
    // 同じテーブルのexpires_atをUTCで扱っているため(上記find_valid_reset_token参照)、
    // used_atも一貫してUTCで記録する
    $stmt = $pdo->prepare('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE id = :id');
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
        ORDER BY e.cycle_id, e.is_discontinued, e.id"
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

// $limitを指定すると、直近(logged_date, id 降順)の$limit件を降順のまま返す
// (「直近の履歴」用。新しい記録を上に表示するため、2026-08-19からは反転しない。
// グラフの期間指定とは独立して使う。fetch_recent_logs()と同じ並び順)
function fetch_body_weight_logs(PDO $pdo, int $userId, ?string $dateFrom, ?string $dateTo, ?int $limit = null): array
{
    $sql = 'SELECT id, logged_date, weight, body_fat_percentage FROM body_weight_logs WHERE user_id = :user_id';
    $params = ['user_id' => $userId];
    if ($dateFrom !== null) {
        $sql .= ' AND logged_date >= :date_from';
        $params['date_from'] = $dateFrom;
    }
    if ($dateTo !== null) {
        $sql .= ' AND logged_date <= :date_to';
        $params['date_to'] = $dateTo;
    }
    if ($limit !== null) {
        $sql .= ' ORDER BY logged_date DESC, id DESC LIMIT :limit';
    } else {
        $sql .= ' ORDER BY logged_date';
    }

    $stmt = $pdo->prepare($sql);
    if ($limit !== null) {
        foreach ($params as $key => $value) {
            $stmt->bindValue(':' . $key, $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
    } else {
        $stmt->execute($params);
    }
    $rows = $stmt->fetchAll();

    return array_map(function ($r) {
        return [
            'id' => (int) $r['id'],
            'logged_date' => $r['logged_date'],
            'weight' => (float) $r['weight'],
            'body_fat_percentage' => $r['body_fat_percentage'] !== null ? (float) $r['body_fat_percentage'] : null,
        ];
    }, $rows);
}

// design.md §2.6: 同じ日に再送信した場合は既存行を上書きする。体脂肪率は任意項目(UI再設計フェーズ2)
function upsert_body_weight_log(PDO $pdo, int $userId, string $loggedDate, float $weight, ?float $bodyFatPercentage = null): void
{
    $stmt = $pdo->prepare(
        'INSERT INTO body_weight_logs (user_id, logged_date, weight, body_fat_percentage)
         VALUES (:user_id, :logged_date, :weight, :body_fat_percentage)
         ON DUPLICATE KEY UPDATE weight = VALUES(weight), body_fat_percentage = VALUES(body_fat_percentage)'
    );
    $stmt->execute([
        'user_id' => $userId,
        'logged_date' => $loggedDate,
        'weight' => $weight,
        'body_fat_percentage' => $bodyFatPercentage,
    ]);
}

function find_body_weight_log(PDO $pdo, int $userId, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT id FROM body_weight_logs WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

// 2026-08-15追加: 過去の記録の日付・体重を直接編集する。ON DUPLICATE KEYには頼らず、
// 事前チェックで衝突を検出する(他のUNIQUE制約違反の扱いと同じくraw SQLエラーを返さないため)。
// 戻り値false = 編集後の日付が既存の別記録と重複(呼び出し側でduplicate_dateエラーに変換する)。
function update_body_weight_log(PDO $pdo, int $userId, int $id, string $loggedDate, float $weight, ?float $bodyFatPercentage = null): bool
{
    $stmt = $pdo->prepare(
        'SELECT id FROM body_weight_logs WHERE user_id = :user_id AND logged_date = :logged_date AND id != :id'
    );
    $stmt->execute(['user_id' => $userId, 'logged_date' => $loggedDate, 'id' => $id]);
    if ($stmt->fetch()) {
        return false;
    }

    $stmt = $pdo->prepare(
        'UPDATE body_weight_logs SET logged_date = :logged_date, weight = :weight, body_fat_percentage = :body_fat_percentage
         WHERE id = :id'
    );
    $stmt->execute([
        'logged_date' => $loggedDate,
        'weight' => $weight,
        'body_fat_percentage' => $bodyFatPercentage,
        'id' => $id,
    ]);
    return true;
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
        'SELECT logged_date, weight, body_fat_percentage FROM body_weight_logs WHERE user_id = :user_id ORDER BY logged_date'
    );
    $stmt->execute(['user_id' => $userId]);
    return $stmt->fetchAll();
}

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

// ==== 食品検索(全ユーザー共通マスタ + 独自食材) ====

// クエリを空白(全角スペース含む)で単語分割し、単語ごとのLIKE(AND条件)を追加する。
// 食品標準成分表の実データは「にわとり　［若どり・主品目］　むね　生」のように単語の間に
// 別の語が挟まることが多く、素朴に1つのLIKEにまとめると複数語検索がほぼヒットしなくなるため。
function add_name_search_conditions(string $q, string $paramPrefix, array &$conditions, array &$params): void
{
    $words = preg_split('/[\s\x{3000}]+/u', trim($q), -1, PREG_SPLIT_NO_EMPTY);
    foreach ($words as $i => $word) {
        $key = "{$paramPrefix}{$i}";
        $conditions[] = "name LIKE :{$key}";
        $params[$key] = '%' . $word . '%';
    }
}

function search_foods(PDO $pdo, int $userId, ?string $q, ?string $foodGroupCode, ?float $kcalMin, ?float $kcalMax): array
{
    $conditions = [];
    $params = [];
    if ($q !== null) {
        add_name_search_conditions($q, 'q', $conditions, $params);
    }
    if ($foodGroupCode !== null) {
        $conditions[] = 'food_group_code = :food_group_code';
        $params['food_group_code'] = $foodGroupCode;
    }
    if ($kcalMin !== null) {
        $conditions[] = 'kcal_per_100g >= :kcal_min';
        $params['kcal_min'] = $kcalMin;
    }
    if ($kcalMax !== null) {
        $conditions[] = 'kcal_per_100g <= :kcal_max';
        $params['kcal_max'] = $kcalMax;
    }
    $where = $conditions ? ('WHERE ' . implode(' AND ', $conditions)) : '';

    $stmt = $pdo->prepare(
        "SELECT id, food_group_code, food_group_name, name, kcal_per_100g, protein_g_per_100g, fat_g_per_100g, carb_g_per_100g
         FROM foods $where ORDER BY name LIMIT 100"
    );
    $stmt->execute($params);
    $masterFoods = array_map(function ($r) {
        return [
            'source' => 'master',
            'id' => (int) $r['id'],
            'food_group_code' => $r['food_group_code'],
            'food_group_name' => $r['food_group_name'],
            'name' => $r['name'],
            'kcal_per_100g' => (float) $r['kcal_per_100g'],
            'protein_g_per_100g' => $r['protein_g_per_100g'] !== null ? (float) $r['protein_g_per_100g'] : null,
            'fat_g_per_100g' => $r['fat_g_per_100g'] !== null ? (float) $r['fat_g_per_100g'] : null,
            'carb_g_per_100g' => $r['carb_g_per_100g'] !== null ? (float) $r['carb_g_per_100g'] : null,
        ];
    }, $stmt->fetchAll());

    // 独自食材は食品群を持たないため、food_group_code条件が指定されている場合は対象外にする
    $customFoods = [];
    if ($foodGroupCode === null) {
        $customConditions = ['user_id = :user_id'];
        $customParams = ['user_id' => $userId];
        if ($q !== null) {
            add_name_search_conditions($q, 'cq', $customConditions, $customParams);
        }
        if ($kcalMin !== null) {
            $customConditions[] = 'kcal_per_100g >= :kcal_min';
            $customParams['kcal_min'] = $kcalMin;
        }
        if ($kcalMax !== null) {
            $customConditions[] = 'kcal_per_100g <= :kcal_max';
            $customParams['kcal_max'] = $kcalMax;
        }
        $customWhere = implode(' AND ', $customConditions);
        $customStmt = $pdo->prepare(
            "SELECT id, name, kcal_per_100g, protein_g_per_100g, fat_g_per_100g, carb_g_per_100g
             FROM custom_foods WHERE $customWhere ORDER BY name LIMIT 100"
        );
        $customStmt->execute($customParams);
        $customFoods = array_map(function ($r) {
            return [
                'source' => 'custom',
                'id' => (int) $r['id'],
                'food_group_code' => null,
                'food_group_name' => null,
                'name' => $r['name'],
                'kcal_per_100g' => (float) $r['kcal_per_100g'],
                'protein_g_per_100g' => (float) $r['protein_g_per_100g'],
                'fat_g_per_100g' => (float) $r['fat_g_per_100g'],
                'carb_g_per_100g' => (float) $r['carb_g_per_100g'],
            ];
        }, $customStmt->fetchAll());
    }

    return array_merge($masterFoods, $customFoods);
}

// meal_items・recipe_items追加時に、指定された食品(全ユーザー共通マスタ or 自分の独自食材)の
// 現在の栄養値を取得する。custom_foodは呼び出し中のuser_idのものであることを検証する。
// foodsのprotein/fat/carbが「-」(未測定)でNULLの場合は0として扱う(スナップショット列はNOT NULLのため)。
// $eatingOutMealId指定時は、eating_out_meals(1食分の実値)をそのまま「100gあたり」の
// スナップショット値として返す。呼び出し側がquantity_gを常に100固定で渡すことで、
// per_100g × quantity_g / 100 という既存の計算式をそのまま使い回せる(design.md §2.20)。
// 戻り値の'shop_name'は外食由来のときだけ非nullになる(直近の履歴で「1行目=店名、2行目=料理名」
// のように分けて表示するため、'name'に結合しない。design.md §2.20)。
function resolve_food_source(PDO $pdo, int $userId, ?int $masterFoodId, ?int $customFoodId, ?int $eatingOutMealId = null): ?array
{
    if ($masterFoodId !== null) {
        $stmt = $pdo->prepare(
            'SELECT name, kcal_per_100g, protein_g_per_100g, fat_g_per_100g, carb_g_per_100g FROM foods WHERE id = :id'
        );
        $stmt->execute(['id' => $masterFoodId]);
    } elseif ($customFoodId !== null) {
        $stmt = $pdo->prepare(
            'SELECT name, kcal_per_100g, protein_g_per_100g, fat_g_per_100g, carb_g_per_100g FROM custom_foods
             WHERE id = :id AND user_id = :user_id'
        );
        $stmt->execute(['id' => $customFoodId, 'user_id' => $userId]);
    } else {
        $stmt = $pdo->prepare(
            'SELECT name, shop_name, kcal AS kcal_per_100g, protein_g AS protein_g_per_100g,
                    fat_g AS fat_g_per_100g, carb_g AS carb_g_per_100g
             FROM eating_out_meals WHERE id = :id AND user_id = :user_id'
        );
        $stmt->execute(['id' => $eatingOutMealId, 'user_id' => $userId]);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }
        return [
            'name' => $row['name'],
            'shop_name' => $row['shop_name'],
            'kcal_per_100g' => (float) $row['kcal_per_100g'],
            'protein_g_per_100g' => $row['protein_g_per_100g'] !== null ? (float) $row['protein_g_per_100g'] : 0.0,
            'fat_g_per_100g' => $row['fat_g_per_100g'] !== null ? (float) $row['fat_g_per_100g'] : 0.0,
            'carb_g_per_100g' => $row['carb_g_per_100g'] !== null ? (float) $row['carb_g_per_100g'] : 0.0,
        ];
    }
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    return [
        'name' => $row['name'],
        'shop_name' => null,
        'kcal_per_100g' => (float) $row['kcal_per_100g'],
        'protein_g_per_100g' => $row['protein_g_per_100g'] !== null ? (float) $row['protein_g_per_100g'] : 0.0,
        'fat_g_per_100g' => $row['fat_g_per_100g'] !== null ? (float) $row['fat_g_per_100g'] : 0.0,
        'carb_g_per_100g' => $row['carb_g_per_100g'] !== null ? (float) $row['carb_g_per_100g'] : 0.0,
    ];
}

// ==== 外食(eating_out_meals) ====

function fetch_eating_out_meals(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare(
        'SELECT id, name, shop_name, kcal, protein_g, fat_g, carb_g FROM eating_out_meals
         WHERE user_id = :user_id ORDER BY name'
    );
    $stmt->execute(['user_id' => $userId]);
    return array_map(function ($r) {
        return [
            'id' => (int) $r['id'],
            'name' => $r['name'],
            'shop_name' => $r['shop_name'],
            'kcal' => (float) $r['kcal'],
            'protein_g' => (float) $r['protein_g'],
            'fat_g' => (float) $r['fat_g'],
            'carb_g' => (float) $r['carb_g'],
        ];
    }, $stmt->fetchAll());
}

function find_eating_out_meal(PDO $pdo, int $userId, int $id): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, name, shop_name, kcal, protein_g, fat_g, carb_g FROM eating_out_meals
         WHERE id = :id AND user_id = :user_id'
    );
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'shop_name' => $row['shop_name'],
        'kcal' => (float) $row['kcal'],
        'protein_g' => (float) $row['protein_g'],
        'fat_g' => (float) $row['fat_g'],
        'carb_g' => (float) $row['carb_g'],
    ];
}

function create_eating_out_meal(
    PDO $pdo,
    int $userId,
    string $name,
    ?string $shopName,
    float $kcal,
    float $protein,
    float $fat,
    float $carb
): int {
    $stmt = $pdo->prepare(
        'INSERT INTO eating_out_meals (user_id, name, shop_name, kcal, protein_g, fat_g, carb_g)
         VALUES (:user_id, :name, :shop_name, :kcal, :protein, :fat, :carb)'
    );
    $stmt->execute([
        'user_id' => $userId, 'name' => $name, 'shop_name' => $shopName,
        'kcal' => $kcal, 'protein' => $protein, 'fat' => $fat, 'carb' => $carb,
    ]);
    return (int) $pdo->lastInsertId();
}

function update_eating_out_meal(
    PDO $pdo,
    int $id,
    string $name,
    ?string $shopName,
    float $kcal,
    float $protein,
    float $fat,
    float $carb
): void {
    $stmt = $pdo->prepare(
        'UPDATE eating_out_meals SET name = :name, shop_name = :shop_name, kcal = :kcal, protein_g = :protein,
            fat_g = :fat, carb_g = :carb WHERE id = :id'
    );
    $stmt->execute([
        'name' => $name, 'shop_name' => $shopName, 'kcal' => $kcal, 'protein' => $protein, 'fat' => $fat, 'carb' => $carb, 'id' => $id,
    ]);
}

function delete_eating_out_meal(PDO $pdo, int $id): void
{
    // meal_items.eating_out_meal_idはON DELETE SET NULLのため、custom_foodsと違い
    // 使用中チェックは不要(過去の記録はfood_name_snapshot等で既に自己完結している)
    $stmt = $pdo->prepare('DELETE FROM eating_out_meals WHERE id = :id');
    $stmt->execute(['id' => $id]);
}

// ==== 独自食材(custom_foods) ====

function fetch_custom_foods(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare(
        'SELECT id, name, kcal_per_100g, protein_g_per_100g, fat_g_per_100g, carb_g_per_100g
         FROM custom_foods WHERE user_id = :user_id ORDER BY name'
    );
    $stmt->execute(['user_id' => $userId]);
    return array_map(function ($r) {
        return [
            'id' => (int) $r['id'],
            'name' => $r['name'],
            'kcal_per_100g' => (float) $r['kcal_per_100g'],
            'protein_g_per_100g' => (float) $r['protein_g_per_100g'],
            'fat_g_per_100g' => (float) $r['fat_g_per_100g'],
            'carb_g_per_100g' => (float) $r['carb_g_per_100g'],
        ];
    }, $stmt->fetchAll());
}

function find_custom_food(PDO $pdo, int $userId, int $id): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, name, kcal_per_100g, protein_g_per_100g, fat_g_per_100g, carb_g_per_100g
         FROM custom_foods WHERE id = :id AND user_id = :user_id'
    );
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'kcal_per_100g' => (float) $row['kcal_per_100g'],
        'protein_g_per_100g' => (float) $row['protein_g_per_100g'],
        'fat_g_per_100g' => (float) $row['fat_g_per_100g'],
        'carb_g_per_100g' => (float) $row['carb_g_per_100g'],
    ];
}

function create_custom_food(
    PDO $pdo,
    int $userId,
    string $name,
    float $kcal,
    float $protein,
    float $fat,
    float $carb
): int {
    $stmt = $pdo->prepare(
        'INSERT INTO custom_foods (user_id, name, kcal_per_100g, protein_g_per_100g, fat_g_per_100g, carb_g_per_100g)
         VALUES (:user_id, :name, :kcal, :protein, :fat, :carb)'
    );
    $stmt->execute([
        'user_id' => $userId, 'name' => $name, 'kcal' => $kcal, 'protein' => $protein, 'fat' => $fat, 'carb' => $carb,
    ]);
    return (int) $pdo->lastInsertId();
}

function update_custom_food(PDO $pdo, int $id, string $name, float $kcal, float $protein, float $fat, float $carb): void
{
    $stmt = $pdo->prepare(
        'UPDATE custom_foods SET name = :name, kcal_per_100g = :kcal, protein_g_per_100g = :protein,
            fat_g_per_100g = :fat, carb_g_per_100g = :carb WHERE id = :id'
    );
    $stmt->execute(['name' => $name, 'kcal' => $kcal, 'protein' => $protein, 'fat' => $fat, 'carb' => $carb, 'id' => $id]);
}

// recipe_itemsからの参照(既定でON DELETE RESTRICT)が残っている独自食材は削除できない
function custom_food_in_use(PDO $pdo, int $id): bool
{
    $stmt = $pdo->prepare('SELECT 1 FROM recipe_items WHERE custom_food_id = :id LIMIT 1');
    $stmt->execute(['id' => $id]);
    return (bool) $stmt->fetchColumn();
}

function delete_custom_food(PDO $pdo, int $id): void
{
    $stmt = $pdo->prepare('DELETE FROM custom_foods WHERE id = :id');
    $stmt->execute(['id' => $id]);
}

// ==== レシピ(recipes/recipe_items) ====

function fetch_recipes(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare(
        'SELECT id, name, share_token_hash IS NOT NULL AS is_shared FROM recipes WHERE user_id = :user_id ORDER BY name'
    );
    $stmt->execute(['user_id' => $userId]);
    $recipes = $stmt->fetchAll();
    if (count($recipes) === 0) {
        return [];
    }

    $itemsStmt = $pdo->prepare(
        'SELECT ri.recipe_id, ri.master_food_id, ri.custom_food_id, ri.quantity_g,
                COALESCE(f.name, cf.name) AS food_name
         FROM recipe_items ri
         LEFT JOIN foods f ON f.id = ri.master_food_id
         LEFT JOIN custom_foods cf ON cf.id = ri.custom_food_id
         WHERE ri.user_id = :user_id
         ORDER BY ri.id'
    );
    $itemsStmt->execute(['user_id' => $userId]);
    $itemsByRecipe = [];
    foreach ($itemsStmt->fetchAll() as $row) {
        $itemsByRecipe[(int) $row['recipe_id']][] = [
            'master_food_id' => $row['master_food_id'] !== null ? (int) $row['master_food_id'] : null,
            'custom_food_id' => $row['custom_food_id'] !== null ? (int) $row['custom_food_id'] : null,
            'food_name' => $row['food_name'],
            'quantity_g' => (float) $row['quantity_g'],
        ];
    }

    return array_map(function ($r) use ($itemsByRecipe) {
        return [
            'id' => (int) $r['id'],
            'name' => $r['name'],
            'is_shared' => (bool) $r['is_shared'],
            'items' => $itemsByRecipe[(int) $r['id']] ?? [],
        ];
    }, $recipes);
}

function find_recipe(PDO $pdo, int $userId, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT id, name FROM recipes WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

// design.md §2.19: レシピの共有リンク機能。生トークンはDBに残さず、SHA-256ハッシュのみ保存する
// (password_reset_tokensと同じ方針、generate_random_token/hash_tokenを再利用)。
// 有効化のたびに新しいトークンで上書きする(既存トークンを「返す」という選択肢は、生トークンを
// DBに残さない設計上そもそも存在しないため。結果として「再度共有」が暗黙のリンク再発行になる)
function enable_recipe_sharing(PDO $pdo, int $userId, int $recipeId): string
{
    $token = generate_random_token();
    $stmt = $pdo->prepare('UPDATE recipes SET share_token_hash = :hash WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['hash' => hash_token($token), 'id' => $recipeId, 'user_id' => $userId]);
    return $token;
}

function disable_recipe_sharing(PDO $pdo, int $userId, int $recipeId): void
{
    $stmt = $pdo->prepare('UPDATE recipes SET share_token_hash = NULL WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['id' => $recipeId, 'user_id' => $userId]);
}

// 共有リンクの公開閲覧ページ用。未ログインの閲覧者から呼ばれるため、current_user_idではなく
// トークンから引いたオーナーのuser_idを呼び出し側がexpand_recipe_items()に渡す
function find_recipe_by_share_token(PDO $pdo, string $tokenHash): ?array
{
    $stmt = $pdo->prepare('SELECT id, user_id, name FROM recipes WHERE share_token_hash = :hash');
    $stmt->execute(['hash' => $tokenHash]);
    $row = $stmt->fetch();
    return $row ?: null;
}

// $items: [['master_food_id' => ?int, 'custom_food_id' => ?int, 'quantity_g' => float], ...]
function insert_recipe_items(PDO $pdo, int $userId, int $recipeId, array $items): void
{
    $stmt = $pdo->prepare(
        'INSERT INTO recipe_items (recipe_id, user_id, master_food_id, custom_food_id, quantity_g)
         VALUES (:recipe_id, :user_id, :master_food_id, :custom_food_id, :quantity_g)'
    );
    foreach ($items as $item) {
        $stmt->execute([
            'recipe_id' => $recipeId,
            'user_id' => $userId,
            'master_food_id' => $item['master_food_id'],
            'custom_food_id' => $item['custom_food_id'],
            'quantity_g' => $item['quantity_g'],
        ]);
    }
}

function create_recipe(PDO $pdo, int $userId, string $name, array $items): int
{
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('INSERT INTO recipes (user_id, name) VALUES (:user_id, :name)');
        $stmt->execute(['user_id' => $userId, 'name' => $name]);
        $recipeId = (int) $pdo->lastInsertId();
        insert_recipe_items($pdo, $userId, $recipeId, $items);
        $pdo->commit();
        return $recipeId;
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function update_recipe(PDO $pdo, int $userId, int $recipeId, string $name, array $items): void
{
    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE recipes SET name = :name WHERE id = :id')->execute(['name' => $name, 'id' => $recipeId]);
        $pdo->prepare('DELETE FROM recipe_items WHERE recipe_id = :id')->execute(['id' => $recipeId]);
        insert_recipe_items($pdo, $userId, $recipeId, $items);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function delete_recipe(PDO $pdo, int $id): void
{
    // recipe_itemsはON DELETE CASCADEで連動削除される(design.md §2.14)
    $stmt = $pdo->prepare('DELETE FROM recipes WHERE id = :id');
    $stmt->execute(['id' => $id]);
}

// add_recipe.php・edit_recipe.php共通: レシピの構成食材配列をバリデーションしつつ、
// recipe_items用のitems配列を組み立てる。レシピはテンプレートなので栄養値のスナップショットは持たない(§2.14)。
function parse_recipe_items(PDO $pdo, int $userId, $rawItems): array
{
    if (!is_array($rawItems) || count($rawItems) === 0) {
        json_error('itemsは1件以上必要です', 400);
    }
    $items = [];
    foreach ($rawItems as $rawItem) {
        if (!is_array($rawItem)) {
            json_error('itemsの形式が不正です', 400);
        }
        $masterFoodId = optional_int($rawItem, 'master_food_id');
        $customFoodId = optional_int($rawItem, 'custom_food_id');
        if (($masterFoodId === null) === ($customFoodId === null)) {
            json_error('master_food_idかcustom_food_idのどちらか一方を指定してください', 400);
        }
        $quantity = require_positive_number($rawItem, 'quantity_g');
        if (resolve_food_source($pdo, $userId, $masterFoodId, $customFoodId) === null) {
            json_error('食品が見つかりません', 404);
        }
        $items[] = ['master_food_id' => $masterFoodId, 'custom_food_id' => $customFoodId, 'quantity_g' => $quantity];
    }
    return $items;
}

// ==== 食事ログ(meals/meal_items) ====

// $limitを指定すると、直近(logged_date, id 降順)の$limit件だけを日付昇順で返す
// (「最近の記録」用。実績グラフの期間指定とは独立して使う)
function fetch_meals(PDO $pdo, int $userId, ?string $dateFrom, ?string $dateTo, ?int $limit = null): array
{
    $sql = 'SELECT id, logged_date, meal_type, photo_path FROM meals WHERE user_id = :user_id';
    $params = ['user_id' => $userId];
    if ($dateFrom !== null) {
        $sql .= ' AND logged_date >= :date_from';
        $params['date_from'] = $dateFrom;
    }
    if ($dateTo !== null) {
        $sql .= ' AND logged_date <= :date_to';
        $params['date_to'] = $dateTo;
    }
    if ($limit !== null) {
        $sql .= ' ORDER BY logged_date DESC, id DESC LIMIT :limit';
    } else {
        $sql .= ' ORDER BY logged_date, id';
    }
    $stmt = $pdo->prepare($sql);
    if ($limit !== null) {
        foreach ($params as $key => $value) {
            $stmt->bindValue(':' . $key, $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
    } else {
        $stmt->execute($params);
    }
    $meals = $limit !== null ? array_reverse($stmt->fetchAll()) : $stmt->fetchAll();
    if (count($meals) === 0) {
        return [];
    }

    $itemsStmt = $pdo->prepare(
        'SELECT id, meal_id, master_food_id, custom_food_id, eating_out_meal_id, food_name_snapshot, kcal_per_100g_snapshot,
                protein_g_per_100g_snapshot, fat_g_per_100g_snapshot, carb_g_per_100g_snapshot,
                quantity_g, recipe_batch_id, recipe_name_snapshot, eating_out_shop_name_snapshot
         FROM meal_items WHERE user_id = :user_id ORDER BY id'
    );
    $itemsStmt->execute(['user_id' => $userId]);
    $itemsByMeal = [];
    foreach ($itemsStmt->fetchAll() as $row) {
        $itemsByMeal[(int) $row['meal_id']][] = [
            'id' => (int) $row['id'],
            'master_food_id' => $row['master_food_id'] !== null ? (int) $row['master_food_id'] : null,
            'custom_food_id' => $row['custom_food_id'] !== null ? (int) $row['custom_food_id'] : null,
            'eating_out_meal_id' => $row['eating_out_meal_id'] !== null ? (int) $row['eating_out_meal_id'] : null,
            'food_name' => $row['food_name_snapshot'],
            'kcal_per_100g' => (float) $row['kcal_per_100g_snapshot'],
            'protein_g_per_100g' => (float) $row['protein_g_per_100g_snapshot'],
            'fat_g_per_100g' => (float) $row['fat_g_per_100g_snapshot'],
            'carb_g_per_100g' => (float) $row['carb_g_per_100g_snapshot'],
            'quantity_g' => (float) $row['quantity_g'],
            'recipe_batch_id' => $row['recipe_batch_id'],
            'recipe_name' => $row['recipe_name_snapshot'],
            'eating_out_shop_name' => $row['eating_out_shop_name_snapshot'],
        ];
    }

    return array_map(function ($m) use ($itemsByMeal) {
        return [
            'id' => (int) $m['id'],
            'logged_date' => $m['logged_date'],
            'meal_type' => $m['meal_type'],
            'photo_path' => $m['photo_path'],
            'items' => $itemsByMeal[(int) $m['id']] ?? [],
        ];
    }, $meals);
}

function find_meal(PDO $pdo, int $userId, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT id, photo_path FROM meals WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

// 2026-08-18追加: 同じ日付・区分の食事は1枚のカードにまとめたいというUI要望のため、
// add_meal.php はこの関数で既存の食事を探し、無ければ新規作成する(design.md §2.15)
function find_meal_by_date_and_type(PDO $pdo, int $userId, string $loggedDate, string $mealType): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, photo_path FROM meals WHERE user_id = :user_id AND logged_date = :logged_date AND meal_type = :meal_type'
    );
    $stmt->execute(['user_id' => $userId, 'logged_date' => $loggedDate, 'meal_type' => $mealType]);
    $row = $stmt->fetch();
    return $row ?: null;
}

// 2026-08-15追加(§2.18): 写真の添付・差し替え・削除。$photoPathはmeal_photos/{user_id}/{uuid}.jpg
// のような相対パス、削除時はnullを渡す。呼び出し側で古いファイルの削除を行う(この関数はDB更新のみ)。
function update_meal_photo(PDO $pdo, int $mealId, ?string $photoPath): void
{
    $stmt = $pdo->prepare('UPDATE meals SET photo_path = :photo_path WHERE id = :id');
    $stmt->execute(['photo_path' => $photoPath, 'id' => $mealId]);
}

function create_meal(PDO $pdo, int $userId, string $loggedDate, string $mealType, ?string $photoPath): int
{
    $stmt = $pdo->prepare(
        'INSERT INTO meals (user_id, logged_date, meal_type, photo_path)
         VALUES (:user_id, :logged_date, :meal_type, :photo_path)'
    );
    $stmt->execute([
        'user_id' => $userId, 'logged_date' => $loggedDate, 'meal_type' => $mealType, 'photo_path' => $photoPath,
    ]);
    return (int) $pdo->lastInsertId();
}

// design.md §2.15: 追加した瞬間の栄養値をスナップショットする。
// $items: [['master_food_id' => ?int, 'custom_food_id' => ?int, 'eating_out_meal_id' => ?int,
//           'quantity_g' => float, 'food' => resolve_food_source()の戻り値], ...]
function insert_meal_items(
    PDO $pdo,
    int $userId,
    int $mealId,
    array $items,
    ?string $recipeBatchId,
    ?string $recipeNameSnapshot
): array {
    $stmt = $pdo->prepare(
        'INSERT INTO meal_items
            (meal_id, user_id, master_food_id, custom_food_id, eating_out_meal_id, food_name_snapshot,
             kcal_per_100g_snapshot, protein_g_per_100g_snapshot, fat_g_per_100g_snapshot, carb_g_per_100g_snapshot,
             quantity_g, recipe_batch_id, recipe_name_snapshot, eating_out_shop_name_snapshot)
         VALUES
            (:meal_id, :user_id, :master_food_id, :custom_food_id, :eating_out_meal_id, :food_name_snapshot,
             :kcal, :protein, :fat, :carb, :quantity_g, :recipe_batch_id, :recipe_name_snapshot, :eating_out_shop_name_snapshot)'
    );
    $ids = [];
    foreach ($items as $item) {
        $stmt->execute([
            'meal_id' => $mealId,
            'user_id' => $userId,
            'master_food_id' => $item['master_food_id'],
            'custom_food_id' => $item['custom_food_id'],
            'eating_out_meal_id' => $item['eating_out_meal_id'],
            'food_name_snapshot' => $item['food']['name'],
            'kcal' => $item['food']['kcal_per_100g'],
            'protein' => $item['food']['protein_g_per_100g'],
            'fat' => $item['food']['fat_g_per_100g'],
            'carb' => $item['food']['carb_g_per_100g'],
            'quantity_g' => $item['quantity_g'],
            'recipe_batch_id' => $recipeBatchId,
            'recipe_name_snapshot' => $recipeNameSnapshot,
            'eating_out_shop_name_snapshot' => $item['food']['shop_name'] ?? null,
        ]);
        $ids[] = (int) $pdo->lastInsertId();
    }
    return $ids;
}

// レシピを構成食材まで展開し、insert_meal_items()にそのまま渡せるitems配列を組み立てる(design.md §2.15)
function expand_recipe_items(PDO $pdo, int $userId, int $recipeId): array
{
    $stmt = $pdo->prepare('SELECT master_food_id, custom_food_id, quantity_g FROM recipe_items WHERE recipe_id = :recipe_id');
    $stmt->execute(['recipe_id' => $recipeId]);
    $items = [];
    foreach ($stmt->fetchAll() as $row) {
        $masterFoodId = $row['master_food_id'] !== null ? (int) $row['master_food_id'] : null;
        $customFoodId = $row['custom_food_id'] !== null ? (int) $row['custom_food_id'] : null;
        $food = resolve_food_source($pdo, $userId, $masterFoodId, $customFoodId);
        if ($food === null) {
            continue; // 参照先が削除済み(通常は起こらないが念のため)
        }
        $items[] = [
            'master_food_id' => $masterFoodId,
            'custom_food_id' => $customFoodId,
            'eating_out_meal_id' => null, // レシピの構成食材は材料が分かるものに限るため、外食は使わない
            'quantity_g' => (float) $row['quantity_g'],
            'food' => $food,
        ];
    }
    return $items;
}

// add_meal.php・add_meal_item.php共通: レシピ指定 or 生の食材配列から、insert_meal_items()用のitems配列と、
// レシピ経由の場合のグループID・レシピ名を組み立てる。戻り値: [items, recipeBatchId, recipeNameSnapshot]
function resolve_items_for_meal(PDO $pdo, int $userId, ?int $recipeId, $rawItems): array
{
    if ($recipeId !== null) {
        $recipe = find_recipe($pdo, $userId, $recipeId);
        if (!$recipe) {
            json_error('レシピが見つかりません', 404);
        }
        $items = expand_recipe_items($pdo, $userId, $recipeId);
        if (count($items) === 0) {
            json_error('レシピに食材が登録されていません', 400);
        }
        return [$items, generate_uuid_v4(), $recipe['name']];
    }

    if (!is_array($rawItems) || count($rawItems) === 0) {
        json_error('itemsまたはrecipe_idのいずれかが必要です', 400);
    }
    $items = [];
    foreach ($rawItems as $rawItem) {
        if (!is_array($rawItem)) {
            json_error('itemsの形式が不正です', 400);
        }
        $masterFoodId = optional_int($rawItem, 'master_food_id');
        $customFoodId = optional_int($rawItem, 'custom_food_id');
        $eatingOutMealId = optional_int($rawItem, 'eating_out_meal_id');
        if (count(array_filter([$masterFoodId, $customFoodId, $eatingOutMealId], fn ($v) => $v !== null)) !== 1) {
            json_error('master_food_id・custom_food_id・eating_out_meal_idのいずれか1つだけを指定してください', 400);
        }
        $quantity = require_positive_number($rawItem, 'quantity_g');
        $food = resolve_food_source($pdo, $userId, $masterFoodId, $customFoodId, $eatingOutMealId);
        if ($food === null) {
            json_error('食品が見つかりません', 404);
        }
        $items[] = [
            'master_food_id' => $masterFoodId,
            'custom_food_id' => $customFoodId,
            'eating_out_meal_id' => $eatingOutMealId,
            'quantity_g' => $quantity,
            'food' => $food,
        ];
    }
    return [$items, null, null];
}

function find_meal_item(PDO $pdo, int $userId, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT id FROM meal_items WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

// 2026-08-15追加(design.md §2.15): 食材・分量を後から直す。resolve_items_for_meal()と同じ
// resolve_food_source()で食品を解決し直し、*_snapshot列をUPDATEで上書きする(INSERTではなく
// UPDATE対象に使うだけで、追加時と同じ食品解決ロジックを再利用できる)。meal_id・recipe_batch_idは
// 変更しない(食材の中身と分量だけを直す操作とし、どの食事・どのレシピ由来かという所属は動かさない)。
function update_meal_item(PDO $pdo, int $userId, int $id, ?int $masterFoodId, ?int $customFoodId, float $quantityG): void
{
    $food = resolve_food_source($pdo, $userId, $masterFoodId, $customFoodId);
    if ($food === null) {
        json_error('食品が見つかりません', 404);
    }

    $stmt = $pdo->prepare(
        'UPDATE meal_items SET
            master_food_id = :master_food_id,
            custom_food_id = :custom_food_id,
            food_name_snapshot = :food_name_snapshot,
            kcal_per_100g_snapshot = :kcal,
            protein_g_per_100g_snapshot = :protein,
            fat_g_per_100g_snapshot = :fat,
            carb_g_per_100g_snapshot = :carb,
            quantity_g = :quantity_g
         WHERE id = :id'
    );
    $stmt->execute([
        'master_food_id' => $masterFoodId,
        'custom_food_id' => $customFoodId,
        'food_name_snapshot' => $food['name'],
        'kcal' => $food['kcal_per_100g'],
        'protein' => $food['protein_g_per_100g'],
        'fat' => $food['fat_g_per_100g'],
        'carb' => $food['carb_g_per_100g'],
        'quantity_g' => $quantityG,
        'id' => $id,
    ]);
}

function delete_meal_item(PDO $pdo, int $id): void
{
    $stmt = $pdo->prepare('DELETE FROM meal_items WHERE id = :id');
    $stmt->execute(['id' => $id]);
}

// design.md §2.15: 同じrecipe_batch_idを持つ行をまとめて削除する
function delete_meal_item_group(PDO $pdo, int $userId, string $recipeBatchId): int
{
    $stmt = $pdo->prepare('DELETE FROM meal_items WHERE recipe_batch_id = :batch_id AND user_id = :user_id');
    $stmt->execute(['batch_id' => $recipeBatchId, 'user_id' => $userId]);
    return $stmt->rowCount();
}

function delete_meal(PDO $pdo, int $id): void
{
    // meal_itemsはON DELETE CASCADEで連動削除される(design.md §2.15)
    $stmt = $pdo->prepare('DELETE FROM meals WHERE id = :id');
    $stmt->execute(['id' => $id]);
}
