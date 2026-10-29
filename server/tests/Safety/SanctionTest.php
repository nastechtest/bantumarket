<?php

declare(strict_types=1);

namespace NasTech\Tests\Safety;

use NasTech\Identity\AuthFailed;
use NasTech\Safety\Sanction;
use NasTech\Safety\SanctionAction;
use NasTech\Safety\SanctionDecision;
use NasTech\Safety\SanctionState;
use NasTech\Safety\SafetyEvents;
use NasTech\Safety\SafetyRuleViolation;
use NasTech\Tests\Safety\Support\SafetyFixture;
use NasTech\Tests\TestCase;

/**
 * Sanctions: a warning is one actor, a restraint is two, the reason is
 * mandatory, the target must exist, and a ban reaches Identity's session port.
 * The evidence rows are append-only and say who decided, when and why.
 */
final class SanctionTest extends TestCase
{
    public function testAWarningIsSingleActorAndLeavesOneEvidenceRow(): void
    {
        $fixture = new SafetyFixture();

        $warning = $fixture->service->requestSanction(
            $fixture->staff->id,
            $fixture->reported->id,
            SanctionAction::WARNING,
            'First warning for off-platform payment pressure',
            $fixture->futureExpiry(),
        );

        $this->assertSame(SanctionState::APPLIED, $warning->state);
        $this->assertSame(null, $warning->checkerId);
        $this->assertSame($fixture->staff->id, $warning->makerId);

        $evidence = $fixture->service->evidenceFor($warning->id);
        $this->assertCount(1, $evidence);
        $this->assertSame(SanctionDecision::WARNING_ISSUED, $evidence[0]->decision);
        $this->assertSame(SanctionDecision::ROLE_MAKER, $evidence[0]->actorRole);
        $this->assertSame($fixture->staff->id, $evidence[0]->actorId);
    }

    public function testABanIsProposedByOneActorAndAppliedByADifferentOne(): void
    {
        $fixture = new SafetyFixture();

        $proposal = $fixture->service->requestSanction(
            $fixture->staff->id,
            $fixture->reported->id,
            SanctionAction::BAN,
            'Confirmed fraud after a second buyer complaint',
            $fixture->futureExpiry(),
        );

        $this->assertSame(SanctionState::PROPOSED, $proposal->state);
        $this->assertSame(null, $proposal->checkerId);
        $this->assertCount(1, $fixture->service->evidenceFor($proposal->id));

        $this->assertThrows(
            SafetyRuleViolation::class,
            fn () => $fixture->service->approveSanction($fixture->staff->id, $proposal->id),
            'different accounts',
        );

        $applied = $fixture->service->approveSanction($fixture->staffTwo->id, $proposal->id);
        $this->assertSame(SanctionState::APPLIED, $applied->state);
        $this->assertSame($fixture->staffTwo->id, $applied->checkerId);

        $evidence = $fixture->service->evidenceFor($proposal->id);
        $this->assertCount(2, $evidence);
        $this->assertSame(SanctionDecision::PROPOSED, $evidence[0]->decision);
        $this->assertSame(SanctionDecision::APPROVED, $evidence[1]->decision);
        $this->assertSame(SanctionDecision::ROLE_CHECKER, $evidence[1]->actorRole);
    }

    public function testASuspendIsAlsoMakerChecker(): void
    {
        $fixture = new SafetyFixture();

        $proposal = $fixture->service->requestSanction(
            $fixture->staff->id,
            $fixture->stranger->id,
            SanctionAction::SUSPEND,
            'Repeated abusive messages while the report is reviewed',
            $fixture->futureExpiry('P7D'),
        );

        $this->assertSame(SanctionState::PROPOSED, $proposal->state);

        $applied = $fixture->service->approveSanction($fixture->staffTwo->id, $proposal->id);
        $this->assertSame(SanctionState::APPLIED, $applied->state);
        $this->assertSame(SanctionAction::SUSPEND, $applied->action);
    }

    public function testASanctionWithoutAReasonOrAnExpiryIsRefused(): void
    {
        $fixture = new SafetyFixture();

        $this->assertThrows(
            SafetyRuleViolation::class,
            fn () => $fixture->service->requestSanction(
                $fixture->staff->id,
                $fixture->reported->id,
                SanctionAction::WARNING,
                '   ',
                $fixture->futureExpiry(),
            ),
            'reason',
        );

        $this->assertThrows(
            SafetyRuleViolation::class,
            fn () => $fixture->service->requestSanction(
                $fixture->staff->id,
                $fixture->reported->id,
                SanctionAction::WARNING,
                'Warning for the same conduct',
                $fixture->clock->now(),
            ),
            'expires after',
        );
    }

    public function testASanctionCannotBeAppliedToANonExistentAccount(): void
    {
        $fixture = new SafetyFixture();

        $this->assertThrows(
            SafetyRuleViolation::class,
            fn () => $fixture->service->requestSanction(
                $fixture->staff->id,
                'acc_missing',
                SanctionAction::BAN,
                'Fraud confirmed',
                $fixture->futureExpiry(),
            ),
            'does not exist',
        );

        $this->assertCount(0, $fixture->store->all('safety_sanctions'));
    }

    public function testABanRevokesSessionsThroughIdentity(): void
    {
        $fixture = new SafetyFixture();
        $issued = $fixture->sessions->start($fixture->reported->id, 'test-device', '127.0.0.1');

        $proposal = $fixture->service->requestSanction(
            $fixture->staff->id,
            $fixture->reported->id,
            SanctionAction::BAN,
            'Confirmed fraud',
            $fixture->futureExpiry(),
        );
        $fixture->service->approveSanction($fixture->staffTwo->id, $proposal->id);

        $this->assertThrows(
            AuthFailed::class,
            fn () => $fixture->sessions->authenticate($issued->token),
            'no longer valid',
        );

        $applied = null;
        foreach ($fixture->outbox->dispatched() as $event) {
            if ($event['event_type'] === SafetyEvents::SANCTION_APPLIED) {
                $applied = $event;
            }
        }
        $this->assertNotSame(null, $applied);
        $this->assertSame(1, $applied['payload']['sessions_revoked']);
    }

    public function testASuspensionDoesNotQuietlyBecomeABan(): void
    {
        $fixture = new SafetyFixture();
        $issued = $fixture->sessions->start($fixture->stranger->id, 'test-device-2', '127.0.0.1');

        $proposal = $fixture->service->requestSanction(
            $fixture->staff->id,
            $fixture->stranger->id,
            SanctionAction::SUSPEND,
            'Under review',
            $fixture->futureExpiry('P7D'),
        );
        $fixture->service->approveSanction($fixture->staffTwo->id, $proposal->id);

        // A suspend withholds the account's ability through its own decision;
        // it is not a ban and does not claim the ban's session revocation.
        $fixture->sessions->authenticate($issued->token);
        $this->assertTrue(true, 'the session registry still recognises the account after a suspend');
    }

    public function testTheDecisionEvidenceIsAppendOnly(): void
    {
        $fixture = new SafetyFixture();

        $warning = $fixture->service->requestSanction(
            $fixture->staff->id,
            $fixture->reported->id,
            SanctionAction::WARNING,
            'First warning',
            $fixture->futureExpiry(),
        );
        $row = $fixture->store->all('safety_sanction_decisions')[0];

        $this->assertThrows(
            \DomainException::class,
            fn () => $fixture->store->update('safety_sanction_decisions', $row),
            'append-only',
        );
        $this->assertThrows(
            \DomainException::class,
            fn () => $fixture->store->delete('safety_sanction_decisions', (string) $row['id']),
            'append-only',
        );
        $this->assertCount(1, $fixture->service->evidenceFor($warning->id));
    }
}
