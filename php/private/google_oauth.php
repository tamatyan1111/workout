<?php
// design.md §1.1「Googleログイン」対応。標準的なOAuth2 Authorization Codeフローのみを実装する。
// IDトークンのJWT署名検証はしない(本番にvendor/をデプロイしない方針のため、JWT検証ライブラリを避ける)。
// 代わりに、認可コードをアクセストークンに交換したあと、Google側のuserinfoエンドポイントへの
// HTTPS呼び出しでメールアドレス・subを取得する(Google側で検証済みのデータが返るため、
// 自前でJWT署名を検証する必要がない)。

function google_auth_url(array $config, string $state): string
{
    $params = [
        'client_id' => $config['google_client_id'],
        'redirect_uri' => $config['google_redirect_uri'],
        'response_type' => 'code',
        'scope' => 'openid email profile',
        'state' => $state,
    ];
    return 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params);
}

// 失敗時は例外をthrowする(呼び出し側でThrowableとしてキャッチしてサーバーエラーにする)
function google_exchange_code_for_token(array $config, string $code): string
{
    $response = http_post_form('https://oauth2.googleapis.com/token', [
        'code' => $code,
        'client_id' => $config['google_client_id'],
        'client_secret' => $config['google_client_secret'],
        'redirect_uri' => $config['google_redirect_uri'],
        'grant_type' => 'authorization_code',
    ]);
    if (!isset($response['access_token']) || !is_string($response['access_token'])) {
        throw new RuntimeException('Googleのトークン交換に失敗しました');
    }
    return $response['access_token'];
}

// 戻り値: ['sub' => string, 'email' => string|null]
function google_fetch_userinfo(string $accessToken): array
{
    $response = http_get_json(
        'https://openidconnect.googleapis.com/v1/userinfo',
        ['Authorization: Bearer ' . $accessToken]
    );
    if (!isset($response['sub']) || !is_string($response['sub'])) {
        throw new RuntimeException('Googleのユーザー情報取得に失敗しました');
    }
    return [
        'sub' => $response['sub'],
        'email' => isset($response['email']) && is_string($response['email']) ? $response['email'] : null,
    ];
}

function http_post_form(string $url, array $fields): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($fields),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
    ]);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body === false || $status >= 400) {
        throw new RuntimeException('外部APIへのリクエストに失敗しました');
    }
    $decoded = json_decode((string) $body, true);
    return is_array($decoded) ? $decoded : [];
}

function http_get_json(string $url, array $headers = []): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
    ]);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body === false || $status >= 400) {
        throw new RuntimeException('外部APIへのリクエストに失敗しました');
    }
    $decoded = json_decode((string) $body, true);
    return is_array($decoded) ? $decoded : [];
}
