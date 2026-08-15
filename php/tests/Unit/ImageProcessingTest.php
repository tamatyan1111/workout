<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use ValidationException;

// design.md §2.18: 実際のファイルI/O(一時ファイルへのJPEG生成・保存)を伴うため、
// 他のUnitテストより重いが、DBには依存しないためUnitに置く。
final class ImageProcessingTest extends TestCase
{
    private string $destDir;
    private array $tmpFiles = [];

    protected function setUp(): void
    {
        $this->destDir = sys_get_temp_dir() . '/meal_photo_test_' . uniqid();
    }

    protected function tearDown(): void
    {
        foreach ($this->tmpFiles as $f) {
            if (is_file($f)) {
                unlink($f);
            }
        }
        if (is_dir($this->destDir)) {
            foreach (glob($this->destDir . '/*') as $f) {
                unlink($f);
            }
            rmdir($this->destDir);
        }

        // testDeleteMealPhotoFileRemovesExistingFile用の後片付け(実際のuploadsルート配下に
        // 作ったテストファイル。アサーション失敗時にも残らないよう安全策として毎回チェックする)
        $realTestUserDir = meal_photos_dir_for_user(999999);
        if (is_dir($realTestUserDir)) {
            foreach (glob($realTestUserDir . '/*') as $f) {
                unlink($f);
            }
            rmdir($realTestUserDir);
        }
    }

    private function createTestJpeg(int $width, int $height): string
    {
        $path = tempnam(sys_get_temp_dir(), 'meal_photo_src') . '.jpg';
        $this->tmpFiles[] = $path;
        $image = imagecreatetruecolor($width, $height);
        imagejpeg($image, $path, 90);
        imagedestroy($image);
        return $path;
    }

    public function testResizesImageLargerThanMaxDimension(): void
    {
        $src = $this->createTestJpeg(2000, 1000);
        $filename = process_and_save_meal_photo($src, filesize($src), $this->destDir);

        $saved = $this->destDir . '/' . $filename;
        $this->assertFileExists($saved);
        [$width, $height] = getimagesize($saved);
        $this->assertSame(1600, $width);
        $this->assertSame(800, $height);
    }

    public function testKeepsImageSmallerThanMaxDimensionUnscaled(): void
    {
        $src = $this->createTestJpeg(400, 300);
        $filename = process_and_save_meal_photo($src, filesize($src), $this->destDir);

        [$width, $height] = getimagesize($this->destDir . '/' . $filename);
        $this->assertSame(400, $width);
        $this->assertSame(300, $height);
    }

    public function testRejectsFileOverMaxUploadSize(): void
    {
        $src = $this->createTestJpeg(10, 10);
        $this->expectException(ValidationException::class);
        process_and_save_meal_photo($src, MEAL_PHOTO_MAX_UPLOAD_BYTES + 1, $this->destDir);
    }

    public function testRejectsNonImageFile(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'meal_photo_notimage') . '.jpg';
        $this->tmpFiles[] = $path;
        file_put_contents($path, 'これは画像ではありません');

        $this->expectException(ValidationException::class);
        process_and_save_meal_photo($path, filesize($path), $this->destDir);
    }

    public function testDeleteMealPhotoFileRemovesExistingFile(): void
    {
        $src = $this->createTestJpeg(10, 10);
        $filename = process_and_save_meal_photo($src, filesize($src), meal_photos_dir_for_user(999999));
        $relativePath = '999999/' . $filename;

        $this->assertFileExists(meal_photos_uploads_root() . '/' . $relativePath);
        delete_meal_photo_file($relativePath);
        $this->assertFileDoesNotExist(meal_photos_uploads_root() . '/' . $relativePath);
    }

    public function testDeleteMealPhotoFileIsNoOpForNull(): void
    {
        delete_meal_photo_file(null);
        $this->assertTrue(true); // 例外が起きないことの確認
    }
}
