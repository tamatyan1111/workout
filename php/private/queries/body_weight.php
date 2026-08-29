<?php

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
