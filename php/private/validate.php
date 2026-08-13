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

function optional_bool(array $data, string $key): bool
{
    return array_key_exists($key, $data) ? (bool) $data[$key] : false;
}

function require_email(array $data, string $key): string
{
    $value = require_field($data, $key);
    if (!is_string($value) || !filter_var($value, FILTER_VALIDATE_EMAIL)) {
        throw new ValidationException("{$key}は正しいメールアドレス形式で指定してください");
    }
    return $value;
}

// design.md では強度要件を細かく規定していないため、最低限の長さのみチェックする(YAGNI)
function require_password(array $data, string $key): string
{
    $value = require_field($data, $key);
    if (!is_string($value) || mb_strlen($value) < 8) {
        throw new ValidationException("{$key}は8文字以上で指定してください");
    }
    return $value;
}

function optional_date(array $data, string $key): ?string
{
    $value = optional_field($data, $key);
    if ($value === null) {
        return null;
    }
    $d = DateTime::createFromFormat('Y-m-d', $value);
    $errors = DateTime::getLastErrors();
    if (!$d || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
        throw new ValidationException("{$key}はYYYY-MM-DD形式で指定してください");
    }
    return $value;
}

// design.md §2.1: gender は 'male' | 'female' | 'unspecified'。未指定時は'unspecified'として扱う
function optional_gender(array $data, string $key): string
{
    $value = optional_field($data, $key);
    if ($value === null) {
        return 'unspecified';
    }
    if (!in_array($value, ['male', 'female', 'unspecified'], true)) {
        throw new ValidationException("{$key}の値が不正です");
    }
    return $value;
}
