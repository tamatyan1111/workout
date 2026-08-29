<?php

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
