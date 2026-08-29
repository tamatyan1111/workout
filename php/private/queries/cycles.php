<?php

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
