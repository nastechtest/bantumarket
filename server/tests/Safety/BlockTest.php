<?php

declare(strict_types=1);

namespace NasTech\Tests\Safety;

use NasTech\Safety\MessageDecision;
use NasTech\Safety\SafetyEvents;
use NasTech\Safety\SafetyRuleViolation;
use NasTech\Tests\Safety\Support\SafetyFixture;
use NasTech\Tests\TestCase;

/**
 * A block is one row, idempotent on retry, and a messaging decision that is
 * symmetric: after A blocks B, neither direction is allowed.
 */
final class BlockTest extends TestCase
{
    public function testABlockIsIdempotentAndPublishesOneEvent(): void
    {
        $fixture = new SafetyFixture();

        $first = $fixture->service->block($fixture->reporter->id, $fixture->reported->id, 'Repeated harassment');
        $second = $fixture->service->block($fixture->reporter->id, $fixture->reported->id, 'Repeated harassment');

        $this->assertSame($first->id, $second->id);
        $this->assertCount(1, $fixture->store->all('safety_blocks'));

        $events = 0;
        foreach ($fixture->outbox->dispatched() as $event) {
            if ($event['event_type'] === SafetyEvents::CONTACT_BLOCKED) {
                $events++;
            }
        }
        $this->assertSame(1, $events, 'a retried block does not publish a second ContactBlocked event');
    }

    public function testMayMessageDeniesBothDirectionsOnceTheBlockExists(): void
    {
        $fixture = new SafetyFixture();

        $before = $fixture->service->mayMessage($fixture->reporter->id, $fixture->reported->id);
        $this->assertTrue($before->allowed);
        $this->assertSame(MessageDecision::ALLOWED, $before->reason);

        $fixture->service->block($fixture->reporter->id, $fixture->reported->id, 'Harassment after the sale');

        $fromBlocker = $fixture->service->mayMessage($fixture->reporter->id, $fixture->reported->id);
        $this->assertFalse($fromBlocker->allowed);
        $this->assertSame(MessageDecision::SENDER_BLOCKED_RECIPIENT, $fromBlocker->reason);
        $this->assertSame('Harassment after the sale', $fromBlocker->blockReason);

        $fromBlocked = $fixture->service->mayMessage($fixture->reported->id, $fixture->reporter->id);
        $this->assertFalse($fromBlocked->allowed);
        $this->assertSame(MessageDecision::RECIPIENT_BLOCKED_SENDER, $fromBlocked->reason);
        $this->assertSame('Harassment after the sale', $fromBlocked->blockReason);
    }

    public function testABlockRequiresTwoDifferentExistingAccountsAndAReason(): void
    {
        $fixture = new SafetyFixture();

        $this->assertThrows(
            SafetyRuleViolation::class,
            fn () => $fixture->service->block($fixture->reporter->id, $fixture->reporter->id, 'Me'),
            'cannot block itself',
        );
        $this->assertThrows(
            SafetyRuleViolation::class,
            fn () => $fixture->service->block($fixture->reporter->id, $fixture->reported->id, '   '),
            'records a reason',
        );
        $this->assertThrows(
            SafetyRuleViolation::class,
            fn () => $fixture->service->block($fixture->reporter->id, 'acc_missing', 'Harassment'),
            'does not exist',
        );
        $this->assertCount(0, $fixture->store->all('safety_blocks'));
    }

    public function testAnUnrelatedPairIsStillAllowed(): void
    {
        $fixture = new SafetyFixture();
        $fixture->service->block($fixture->reporter->id, $fixture->reported->id, 'Harassment');

        $decision = $fixture->service->mayMessage($fixture->reporter->id, $fixture->stranger->id);
        $this->assertTrue($decision->allowed);
        $this->assertSame(MessageDecision::ALLOWED, $decision->reason);
    }

    public function testTheBlockRowIsAppendOnly(): void
    {
        $fixture = new SafetyFixture();
        $block = $fixture->service->block($fixture->reporter->id, $fixture->reported->id, 'Harassment');
        $row = $block->toRow();

        $this->assertThrows(
            \DomainException::class,
            fn () => $fixture->store->update('safety_blocks', $row),
            'append-only',
        );
        $this->assertThrows(
            \DomainException::class,
            fn () => $fixture->store->delete('safety_blocks', $block->id),
            'append-only',
        );
    }
}
