<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use ValidationException;

final class ValidateTest extends TestCase
{
    public function testRequireFieldReturnsValue(): void
    {
        $this->assertSame('abc', require_field(['name' => 'abc'], 'name'));
    }

    public function testRequireFieldThrowsWhenMissing(): void
    {
        $this->expectException(ValidationException::class);
        require_field([], 'name');
    }

    public function testRequireFieldThrowsWhenEmptyString(): void
    {
        $this->expectException(ValidationException::class);
        require_field(['name' => ''], 'name');
    }

    public function testOptionalFieldReturnsNullWhenMissing(): void
    {
        $this->assertNull(optional_field([], 'name'));
    }

    public function testOptionalFieldReturnsValueWhenPresent(): void
    {
        $this->assertSame('abc', optional_field(['name' => 'abc'], 'name'));
    }

    public function testRequireIntParsesNumericString(): void
    {
        $this->assertSame(5, require_int(['id' => '5'], 'id'));
    }

    public function testRequireIntThrowsOnNonInteger(): void
    {
        $this->expectException(ValidationException::class);
        require_int(['id' => '5.5'], 'id');
    }

    public function testRequireIntThrowsOnNonNumericString(): void
    {
        $this->expectException(ValidationException::class);
        require_int(['id' => 'abc'], 'id');
    }

    public function testOptionalNumberReturnsNullWhenMissing(): void
    {
        $this->assertNull(optional_number([], 'weight'));
    }

    public function testOptionalNumberParsesFloat(): void
    {
        $this->assertSame(12.5, optional_number(['weight' => '12.5'], 'weight'));
    }

    public function testOptionalNumberThrowsOnNonNumeric(): void
    {
        $this->expectException(ValidationException::class);
        optional_number(['weight' => 'abc'], 'weight');
    }

    public function testOptionalIntTruncatesFloat(): void
    {
        $this->assertSame(12, optional_int(['reps' => '12.9'], 'reps'));
    }

    public function testRequireDateAcceptsValidFormat(): void
    {
        $this->assertSame('2026-08-13', require_date(['logged_date' => '2026-08-13'], 'logged_date'));
    }

    public function testRequireDateRejectsWrongSeparator(): void
    {
        $this->expectException(ValidationException::class);
        require_date(['logged_date' => '2026/08/13'], 'logged_date');
    }

    public function testRequireDateRejectsMissingField(): void
    {
        $this->expectException(ValidationException::class);
        require_date([], 'logged_date');
    }

    public function testOptionalBoolDefaultsFalse(): void
    {
        $this->assertFalse(optional_bool([], 'discontinued'));
    }

    public function testOptionalBoolReadsTruthyValue(): void
    {
        $this->assertTrue(optional_bool(['discontinued' => true], 'discontinued'));
    }

    public function testRequireEmailAcceptsValidFormat(): void
    {
        $this->assertSame('a@example.com', require_email(['email' => 'a@example.com'], 'email'));
    }

    public function testRequireEmailRejectsInvalidFormat(): void
    {
        $this->expectException(ValidationException::class);
        require_email(['email' => 'not-an-email'], 'email');
    }

    public function testRequirePasswordAcceptsEightCharacters(): void
    {
        $this->assertSame('abcdefgh', require_password(['password' => 'abcdefgh'], 'password'));
    }

    public function testRequirePasswordRejectsTooShort(): void
    {
        $this->expectException(ValidationException::class);
        require_password(['password' => 'short'], 'password');
    }

    public function testOptionalDateReturnsNullWhenMissing(): void
    {
        $this->assertNull(optional_date([], 'birth_date'));
    }

    public function testOptionalDateAcceptsValidFormat(): void
    {
        $this->assertSame('1990-01-01', optional_date(['birth_date' => '1990-01-01'], 'birth_date'));
    }

    public function testOptionalDateRejectsWrongFormat(): void
    {
        $this->expectException(ValidationException::class);
        optional_date(['birth_date' => '1990/01/01'], 'birth_date');
    }

    public function testOptionalGenderDefaultsUnspecified(): void
    {
        $this->assertSame('unspecified', optional_gender([], 'gender'));
    }

    public function testOptionalGenderAcceptsKnownValues(): void
    {
        $this->assertSame('male', optional_gender(['gender' => 'male'], 'gender'));
        $this->assertSame('female', optional_gender(['gender' => 'female'], 'gender'));
    }

    public function testOptionalGenderRejectsUnknownValue(): void
    {
        $this->expectException(ValidationException::class);
        optional_gender(['gender' => 'other'], 'gender');
    }
}
