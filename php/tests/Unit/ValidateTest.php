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

    public function testRequireCycleIdAcceptsRange(): void
    {
        $this->assertSame(1, require_cycle_id(['cycle_id' => '1'], 'cycle_id'));
        $this->assertSame(4, require_cycle_id(['cycle_id' => '4'], 'cycle_id'));
    }

    public function testRequireCycleIdRejectsOutOfRange(): void
    {
        $this->expectException(ValidationException::class);
        require_cycle_id(['cycle_id' => '5'], 'cycle_id');
    }

    public function testRequireCycleIdRejectsZero(): void
    {
        $this->expectException(ValidationException::class);
        require_cycle_id(['cycle_id' => '0'], 'cycle_id');
    }

    public function testOptionalBoolDefaultsFalse(): void
    {
        $this->assertFalse(optional_bool([], 'discontinued'));
    }

    public function testOptionalBoolReadsTruthyValue(): void
    {
        $this->assertTrue(optional_bool(['discontinued' => true], 'discontinued'));
    }
}
