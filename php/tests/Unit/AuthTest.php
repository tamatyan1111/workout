<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

// design.md §1.1「認証方式」に対応する、DB非依存の純粋なヘルパー関数のテスト。

final class AuthTest extends TestCase
{
    public function testHashPasswordProducesVerifiableHash(): void
    {
        $hash = hash_password('correct horse battery staple');
        $this->assertTrue(verify_password('correct horse battery staple', $hash));
    }

    public function testVerifyPasswordRejectsWrongPassword(): void
    {
        $hash = hash_password('correct horse battery staple');
        $this->assertFalse(verify_password('wrong password', $hash));
    }

    public function testGenerateRandomTokenIsUnpredictableAndUnique(): void
    {
        $a = generate_random_token();
        $b = generate_random_token();
        $this->assertNotSame($a, $b);
        $this->assertGreaterThanOrEqual(32, strlen($a));
    }

    public function testHashTokenIsDeterministic(): void
    {
        $token = generate_random_token();
        $this->assertSame(hash_token($token), hash_token($token));
    }

    public function testHashTokenDiffersForDifferentTokens(): void
    {
        $this->assertNotSame(hash_token('a'), hash_token('b'));
    }

    // design.md §1.1「レート制限」: 直近15分以内に5回以上失敗していればロック中
    public function testIsLoginLockedFalseWhenNeverFailed(): void
    {
        $user = ['failed_login_count' => 0, 'failed_login_at' => null];
        $this->assertFalse(is_login_locked($user));
    }

    public function testIsLoginLockedFalseWhenFailuresBelowThreshold(): void
    {
        $user = ['failed_login_count' => 4, 'failed_login_at' => date('Y-m-d H:i:s')];
        $this->assertFalse(is_login_locked($user));
    }

    public function testIsLoginLockedTrueWhenRecentlyExceededThreshold(): void
    {
        $user = ['failed_login_count' => 5, 'failed_login_at' => date('Y-m-d H:i:s')];
        $this->assertTrue(is_login_locked($user));
    }

    public function testIsLoginLockedFalseWhenLastFailureOutsideWindow(): void
    {
        $user = ['failed_login_count' => 5, 'failed_login_at' => date('Y-m-d H:i:s', strtotime('-20 minutes'))];
        $this->assertFalse(is_login_locked($user));
    }
}
