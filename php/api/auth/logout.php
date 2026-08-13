<?php
require_once __DIR__ . '/../../private/bootstrap.php';

$config = get_config();
send_cors_headers($config);
require_csrf_header();

try {
    logout_session();
    json_ok();
} catch (Throwable $e) {
    handle_unexpected_error($e);
}
