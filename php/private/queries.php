<?php
// design.md §2「データモデル」§1.2「データ分離の方針」に対応する共通クエリ群。
// api/auth・api の両方から require して使う(コピペで二重管理にしない)。
// user_idを扱う全ての関数は、呼び出し側(各エンドポイント)がrequire_login()で得た
// ログイン中のuser_idを渡す前提とし、ここでは受け取ったuser_idをそのままWHERE句に使う。
//
// 1698行の単一ファイルになっていたものを、2026-08-29にドメインごとのファイルへ分割した
// (queries/配下)。呼び出し側(主にbootstrap.php)からはこのファイル1つをrequireするだけで
// 済むよう、ここでは分割後の各ファイルをまとめてrequireするだけの索引にしている。
require_once __DIR__ . '/queries/users.php';
require_once __DIR__ . '/queries/cycles.php';
require_once __DIR__ . '/queries/exercises.php';
require_once __DIR__ . '/queries/body_weight.php';
require_once __DIR__ . '/queries/export.php';
require_once __DIR__ . '/queries/nutrition_summary.php';
require_once __DIR__ . '/queries/foods.php';
require_once __DIR__ . '/queries/eating_out.php';
require_once __DIR__ . '/queries/meal_favorites.php';
require_once __DIR__ . '/queries/custom_foods.php';
require_once __DIR__ . '/queries/recipes.php';
require_once __DIR__ . '/queries/meals.php';
