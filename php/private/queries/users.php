<?php

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
