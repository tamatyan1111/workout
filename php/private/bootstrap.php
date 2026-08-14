<?php
// 各エンドポイント共通の読み込みをまとめる。GET専用エンドポイントにとってvalidate.phpは
// 関数定義のみで副作用が無いため、まとめて読み込んでも問題ない。

require_once __DIR__ . '/env.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/respond.php';
require_once __DIR__ . '/queries.php';
require_once __DIR__ . '/validation_exception.php';
require_once __DIR__ . '/validate.php';
require_once __DIR__ . '/nutrition_calc.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/google_oauth.php';
require_once __DIR__ . '/mailer.php';
