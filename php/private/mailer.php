<?php
// design.md §1.1「メール送信」対応。XServer標準プラン付属のメール送信機能(PHPネイティブのmail()、
// 実体はサーバー上のMTA経由)を使う。外部ライブラリ・SMTP認証情報は不要。

function send_password_reset_email(array $config, string $toEmail, string $resetUrl): void
{
    $from = $config['mail_from'];
    $subject = '【からだ手帳】パスワード再設定';
    $body = "パスワード再設定のリクエストを受け付けました。\n"
        . "以下のURLから新しいパスワードを設定してください(有効期限: 1時間)。\n\n"
        . $resetUrl . "\n\n"
        . "心当たりがない場合は、このメールを無視してください。";

    $headers = "From: {$from}\r\nContent-Type: text/plain; charset=UTF-8";

    mail($toEmail, mb_encode_mimeheader($subject, 'UTF-8'), $body, $headers);
}
