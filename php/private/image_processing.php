<?php
// design.md §2.18: 食事写真のアップロード処理。
// finfoで実際のMIMEタイプを検証し、GDで長辺1600px・JPEG品質80%にリサイズ圧縮して保存する。

const MEAL_PHOTO_MAX_DIMENSION = 1600;
const MEAL_PHOTO_JPEG_QUALITY = 80;
const MEAL_PHOTO_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const MEAL_PHOTO_ALLOWED_MIME_TYPES = [
    'image/jpeg' => 'imagecreatefromjpeg',
    'image/png' => 'imagecreatefrompng',
    'image/webp' => 'imagecreatefromwebp',
];

// Webから直接アクセス不可なphp/private/配下に保存する(design.md §2.18)。
function meal_photos_uploads_root(): string
{
    return __DIR__ . '/uploads/meal_photos';
}

function meal_photos_dir_for_user(int $userId): string
{
    return meal_photos_uploads_root() . '/' . $userId;
}

// $tmpPathはPHPが受け取ったアップロード済み一時ファイルのパス(is_uploaded_fileでの検証は呼び出し側で行う)。
// $destDirに保存し、生成したファイル名(拡張子込み、ディレクトリ部分を含まない)を返す。
// DBにはこのファイル名を含む相対パス(呼び出し側で組み立てる)を保存する。失敗時はValidationExceptionをthrowする。
function process_and_save_meal_photo(string $tmpPath, int $fileSize, string $destDir): string
{
    if ($fileSize > MEAL_PHOTO_MAX_UPLOAD_BYTES) {
        throw new ValidationException('写真のファイルサイズは8MB以下にしてください');
    }

    $mimeType = (string) mime_content_type($tmpPath);
    if (!array_key_exists($mimeType, MEAL_PHOTO_ALLOWED_MIME_TYPES)) {
        throw new ValidationException('写真はJPEG・PNG・WebP形式のみ対応しています');
    }

    $loader = MEAL_PHOTO_ALLOWED_MIME_TYPES[$mimeType];
    $image = @$loader($tmpPath);
    if ($image === false) {
        throw new ValidationException('写真ファイルを読み込めませんでした');
    }

    $width = imagesx($image);
    $height = imagesy($image);
    $longestSide = max($width, $height);

    if ($longestSide > MEAL_PHOTO_MAX_DIMENSION) {
        $scale = MEAL_PHOTO_MAX_DIMENSION / $longestSide;
        $newWidth = (int) round($width * $scale);
        $newHeight = (int) round($height * $scale);
        $resized = imagescale($image, $newWidth, $newHeight);
        imagedestroy($image);
        $image = $resized;
    }

    if (!is_dir($destDir)) {
        mkdir($destDir, 0755, true);
    }
    $filename = generate_uuid_v4() . '.jpg';
    $destPath = $destDir . '/' . $filename;

    $saved = imagejpeg($image, $destPath, MEAL_PHOTO_JPEG_QUALITY);
    imagedestroy($image);
    if (!$saved) {
        throw new ValidationException('写真の保存に失敗しました');
    }

    return $filename;
}

// $relativePathは"{user_id}/{filename}"形式(meals.photo_pathの値そのもの)。
function delete_meal_photo_file(?string $relativePath): void
{
    if ($relativePath === null) {
        return;
    }
    $fullPath = meal_photos_uploads_root() . '/' . $relativePath;
    if (is_file($fullPath)) {
        unlink($fullPath);
    }
}
