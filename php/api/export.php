<?php
// design.md §3「設定タブ」US-17対応。ブラウザの通常GETナビゲーション(<a href>)でダウンロードさせる想定のため、
// 状態変更を伴わずCSRFヘッダーチェックは行わない。

require_once __DIR__ . '/../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);

try {
    $userId = require_login();
    $pdo = get_pdo();

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="workout_export.csv"');
    header('Cache-Control: no-store');

    $out = fopen('php://output', 'w');
    // BOM付きUTF-8にしてExcelでの文字化けを避ける
    fwrite($out, "\xEF\xBB\xBF");

    fputcsv($out, ['type', 'date', 'cycle', 'exercise', 'set_number', 'weight', 'reps', 'body_fat_percentage']);
    foreach (fetch_logs_for_export($pdo, $userId) as $row) {
        fputcsv($out, [
            'log', $row['logged_date'], $row['cycle_label'], $row['exercise_name'],
            $row['set_number'], $row['weight'], $row['reps'], '',
        ]);
    }
    foreach (fetch_body_weight_logs_for_export($pdo, $userId) as $row) {
        fputcsv($out, ['body_weight', $row['logged_date'], '', '', '', $row['weight'], '', $row['body_fat_percentage']]);
    }
    fclose($out);
    exit;
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
