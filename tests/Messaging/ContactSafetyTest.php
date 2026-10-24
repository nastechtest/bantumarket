<?php

declare(strict_types=1);

namespace NasTech\Tests\Messaging;

use NasTech\Messaging\ContactSafetyScanner;
use NasTech\Messaging\MessagingEvents;
use NasTech\Messaging\SafetyCategory;
use NasTech\Messaging\SafetyConfidence;
use NasTech\Messaging\SafetyRisk;
use NasTech\Tests\Messaging\Support\MessagingFixture;
use NasTech\Tests\TestCase;

/**
 * The scanner is a pattern pipeline, and the two properties the module promises are
 * both negative ones: a shop landline does not raise a safety event, and the matched
 * text never leaves the module in an event payload.
 */
final class ContactSafetyTest extends TestCase
{
    public function testTheRuleListIsFixedDataNotAnAccidentOfCodeOrder(): void
    {
        $expected = [
            'email_address',
            'off_platform_courier',
            'off_platform_meeting',
            'off_platform_messenger',
            'payment_direct',
            'payment_proof_screenshot',
            'phone_landline_sa',
            'phone_mobile_sa',
            'web_url',
        ];

        $this->assertSame($expected, ContactSafetyScanner::ruleIds());
    }

    public function testAShopLandlineIsInformationalAndRaisesNoSafetyEvent(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $fixture->service->sendMessage(
            $thread->id,
            'acc_seller',
            'You can call the shop on 011 234 5678 during trading hours.',
            'clt_land_001',
        );

        $flags = $fixture->store->all('messaging_contact_flags');
        $this->assertCount(1, $flags);
        $this->assertSame('phone_landline_sa', $flags[0]['rule_id']);
        $this->assertSame(SafetyRisk::INFORMATIONAL->value, $flags[0]['risk']);
        $this->assertSame(SafetyConfidence::PATTERN->value, $flags[0]['confidence']);
        $this->assertFalse(
            $this->hasEvent($fixture, MessagingEvents::CONTACT_EXCHANGE_FLAGGED),
            'an informational landline must not put two accounts in front of a reviewer',
        );
    }

    public function testAMobileNumberIsElevatedAndRaisesOneFlaggedEventWithoutTheNumber(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $fixture->service->sendMessage(
            $thread->id,
            'acc_buyer',
            'WhatsApp me on 082 123 4567 to arrange collection.',
            'clt_mob_0001',
        );

        $this->assertTrue($this->hasEvent($fixture, MessagingEvents::CONTACT_EXCHANGE_FLAGGED));
        $event = $this->event($fixture, MessagingEvents::CONTACT_EXCHANGE_FLAGGED);
        $rules = array_map(
            static fn (array $finding): string => $finding['rule_id'],
            $event['payload']['findings'],
        );
        $this->assertSame(['off_platform_messenger', 'phone_mobile_sa'], $rules, 'findings are sorted by rule id');

        $encoded = json_encode($event, JSON_THROW_ON_ERROR);
        $this->assertFalse(str_contains($encoded, '082 123 4567'), 'the phone number is not in the event');
        $this->assertFalse(str_contains($encoded, 'WhatsApp me'), 'the body is not in the event');
        foreach ($event['payload']['findings'] as $finding) {
            $this->assertSame('pattern', $finding['confidence']);
            $this->assertFalse(isset($finding['match']), 'the matched text stays in the module');
        }

        $this->assertCount(2, $fixture->store->all('messaging_contact_flags'), 'flags are still stored as evidence');
    }

    public function testEmailAndPaymentInstructionRulesEachFire(): void
    {
        $scanner = new ContactSafetyScanner();
        $findings = $scanner->scan('Email me at buyer.one@example.co.za; I can EFT tonight.');

        $ids = array_map(static fn ($finding): string => $finding->ruleId, $findings);
        $this->assertSame(['email_address', 'payment_direct'], $ids);
        foreach ($findings as $finding) {
            $this->assertSame(SafetyRisk::ELEVATED, $finding->risk);
            $this->assertSame(SafetyConfidence::PATTERN, $finding->confidence());
        }
        $this->assertSame(SafetyCategory::CONTACT_DETAILS, $findings[0]->category);
        $this->assertSame(SafetyCategory::PAYMENT_INSTRUCTION, $findings[1]->category);
    }

    public function testOnlyAnElevatedFindingJustifiesAnEvent(): void
    {
        $scanner = new ContactSafetyScanner();
        $landline = $scanner->scan('Shop line: 021 555 0100');
        $this->assertFalse(ContactSafetyScanner::shouldRaiseEvent($landline));

        $mixed = $scanner->scan('Shop line 021 555 0100, or my cell 083 765 4321');
        $this->assertTrue(ContactSafetyScanner::shouldRaiseEvent($mixed));
    }

    public function testATwoRuleBodyProducesTwoFlagRowsWithNoDuplicateRule(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $fixture->service->sendMessage(
            $thread->id,
            'acc_seller',
            'See www.nastech.example for the catalogue and mail sales@nastech.example',
            'clt_flags_001',
        );

        $flags = $fixture->store->all('messaging_contact_flags');
        $ruleIds = array_map(static fn (array $row): string => $row['rule_id'], $flags);
        sort($ruleIds);
        $this->assertSame(['email_address', 'web_url'], $ruleIds);
    }

    /**
     * @return list<array<string,mixed>>
     */
    private function events(MessagingFixture $fixture): array
    {
        return $fixture->outbox->dispatched();
    }

    private function hasEvent(MessagingFixture $fixture, string $type): bool
    {
        foreach ($this->events($fixture) as $event) {
            if ($event['event_type'] === $type) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array<string,mixed>
     */
    private function event(MessagingFixture $fixture, string $type): array
    {
        foreach ($this->events($fixture) as $event) {
            if ($event['event_type'] === $type) {
                return $event;
            }
        }
        $this->fail('no ' . $type . ' event');
    }
}
