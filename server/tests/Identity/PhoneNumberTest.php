<?php

declare(strict_types=1);

namespace NasTech\Tests\Identity;

use NasTech\Identity\PhoneNumber;
use NasTech\Tests\TestCase;

/**
 * Phone-first means the number is the identity anchor. Normalisation happens
 * once, and every accepted spelling of one number resolves to one E.164 value;
 * every other spelling is refused rather than stored as a second principal.
 */
final class PhoneNumberTest extends TestCase
{
    public function testLocalSpacingAndDashesNormaliseToOneE164Value(): void
    {
        $forms = [
            '082 123 4567',
            '0821234567',
            '082-123-4567',
            '(082) 123 4567',
            '+27 82 123 4567',
            '+27821234567',
            '0027821234567',
            '27821234567',
        ];

        foreach ($forms as $form) {
            $this->assertSame('+27821234567', PhoneNumber::fromString($form)->e164, "form: {$form}");
        }
    }

    public function testAForeignNumberIsRefusedRatherThanStoredAsAnotherPrincipal(): void
    {
        $this->assertThrows(
            \InvalidArgumentException::class,
            static fn (): PhoneNumber => PhoneNumber::fromString('+44 7700 900123'),
            'South African mobile number',
        );
    }

    public function testATooShortOrNonNumericNumberIsRefused(): void
    {
        foreach (['082 123 456', '08212345678', 'not-a-number', '082 123 45a7'] as $bad) {
            $this->assertThrows(
                \InvalidArgumentException::class,
                static fn (): PhoneNumber => PhoneNumber::fromString($bad),
                '',
            );
        }
    }

    public function testAnErasedDigestIsAcceptedOnlyAsAnErasedValue(): void
    {
        $digest = 'erased_' . str_repeat('a', 64);
        $phone = PhoneNumber::fromString($digest);

        $this->assertTrue($phone->isAnonymised());
        $this->assertSame($digest, $phone->e164);
        $this->assertFalse(PhoneNumber::fromString('0821234567')->isAnonymised());
    }

    public function testTwoSpellingsOfOneNumberAreEqual(): void
    {
        $this->assertTrue(PhoneNumber::fromString('082 123 4567')->equals(PhoneNumber::fromString('+27821234567')));
        $this->assertFalse(PhoneNumber::fromString('082 123 4567')->equals(PhoneNumber::fromString('082 123 4568')));
    }
}
