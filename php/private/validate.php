<?php
// 入力バリデーションの共通ヘルパー。DB側のCHECK/外部キー制約とあわせて二重に守る。
// 失敗時はValidationExceptionをthrowする(json_error()は直接呼ばない)。
// 各エンドポイントの catch (ValidationException $e) { json_error($e->getMessage(), 400); } で
// HTTPレスポンスに変換される。

function require_field(array $data, string $key)
{
    if (!array_key_exists($key, $data) || $data[$key] === null || $data[$key] === '') {
        throw new ValidationException("{$key}は必須です");
    }
    return $data[$key];
}

function optional_field(array $data, string $key)
{
    if (!array_key_exists($key, $data) || $data[$key] === null || $data[$key] === '') {
        return null;
    }
    return $data[$key];
}

function require_int(array $data, string $key): int
{
    $value = require_field($data, $key);
    if (!is_numeric($value) || (int) $value != $value) {
        throw new ValidationException("{$key}は整数で指定してください");
    }
    return (int) $value;
}

function optional_number(array $data, string $key): ?float
{
    $value = optional_field($data, $key);
    if ($value === null) {
        return null;
    }
    if (!is_numeric($value)) {
        throw new ValidationException("{$key}は数値で指定してください");
    }
    return (float) $value;
}

function optional_int(array $data, string $key): ?int
{
    $value = optional_number($data, $key);
    return $value === null ? null : (int) $value;
}

function require_date(array $data, string $key): string
{
    $value = require_field($data, $key);
    $d = DateTime::createFromFormat('Y-m-d', $value);
    $errors = DateTime::getLastErrors();
    if (!$d || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
        throw new ValidationException("{$key}はYYYY-MM-DD形式で指定してください");
    }
    return $value;
}

function require_cycle_id(array $data, string $key): int
{
    $value = require_field($data, $key);
    if (!is_numeric($value) || (int) $value < 1 || (int) $value > 4) {
        throw new ValidationException("{$key}は1〜4で指定してください");
    }
    return (int) $value;
}

function optional_bool(array $data, string $key): bool
{
    return array_key_exists($key, $data) ? (bool) $data[$key] : false;
}
