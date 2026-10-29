<?php

declare(strict_types=1);

namespace NasTech\Tests\Audit;

use NasTech\Audit\ActorKind;
use NasTech\Audit\AuditLog;
use NasTech\Audit\AuditRefused;
use NasTech\Audit\AuditRepository;
use NasTech\Tests\TestCase;

/**
 * The audit log is evidence, so every test here is about a refusal or an atomic
 * outcome rather than the happy path alone.
 *
 * The two failure modes that matter most:
 *   - an action that commits without its audit row (or a row that survives a
 *     rolled-back action), which is what "same transaction" has to mean;
 *   - a secret that arrives in a before/after diff, which would make the audit
 *     log the most complete store of card data in the system.
 */
final class AuditTest extends TestCase
{
    public function testARecordAndItsActionCommitInOneTransaction(): void
    {
        $fx = new AuditFixture();
        $record = $fx->record(action: 'payout.release');

        $returned = $fx->trail->record($record, function () use ($fx): string {
            $fx->store->insert('action_probe', ['id' => 'act_1', 'state' => 'released']);

            return 'released';
        });

        $this->assertSame('released', $returned);
        $this->assertCount(1, $fx->store->all('action_probe'));
        $this->assertCount(1, $fx->store->all('audit_log'));

        $entry = $fx->log->all()[0];
        $this->assertSame('payout.release', $entry->action);
        $this->assertSame($record->requestId, $entry->requestId);
        $this->assertSame(AuditFixture::OCCURRED_AT, $entry->occurredAt->format(\DateTimeInterface::ATOM));
    }

    public function testTheActionIsRefusedWhenTheAuditWriteFails(): void
    {
        $repository = new class implements AuditRepository {
            public function append(array $row): void
            {
                throw new \RuntimeException('audit storage is down');
            }

            public function find(string $id): ?array
            {
                return null;
            }

            public function forTarget(string $targetType, string $targetId): array
            {
                return [];
            }

            public function forRequest(string $requestId): array
            {
                return [];
            }

            public function forActor(string $actorId): array
            {
                return [];
            }

            public function all(): array
            {
                return [];
            }
        };

        $fx = new AuditFixture($repository);
        $worked = false;

        $this->assertThrows(\RuntimeException::class, function () use ($fx, &$worked): void {
            $fx->trail->record($fx->record(), function () use ($fx, &$worked): void {
                $worked = true;
                $fx->store->insert('action_probe', ['id' => 'act_1', 'state' => 'released']);
            });
        }, 'audit storage is down');

        $this->assertFalse($worked, 'the action must not run when the record cannot be written');
        $this->assertSame([], $fx->store->all('action_probe'));
        $this->assertSame([], $fx->store->all('audit_log'));
    }

    public function testACardNumberIsRefusedAndNothingIsWritten(): void
    {
        $fx = new AuditFixture();

        $payloads = [
            ['card_number' => '4111 1111 1111 1111'],
            ['pan' => '4111111111111111'],
            ['note' => 'charged to 4111 1111 1111 1111'],
        ];

        foreach ($payloads as $payload) {
            $thrown = $this->assertThrows(
                AuditRefused::class,
                fn () => $fx->trail->record(
                    $fx->record(after: $payload),
                    fn () => $fx->store->insert('action_probe', ['id' => 'act_1']),
                ),
                'never stored',
            );
            $this->assertSame(AuditRefused::class, $thrown::class);
        }

        $this->assertSame([], $fx->store->all('audit_log'));
        $this->assertSame([], $fx->store->all('action_probe'));
    }

    public function testATokenIsRefusedAndNothingIsWritten(): void
    {
        $fx = new AuditFixture();

        $payloads = [
            ['session_token' => 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl'],
            ['note' => 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456'],
            ['api_key' => 'sk_live_abcdefghijklmnop'],
        ];

        foreach ($payloads as $payload) {
            $this->assertThrows(
                AuditRefused::class,
                fn () => $fx->trail->record(
                    $fx->record(after: $payload),
                    fn () => $fx->store->insert('action_probe', ['id' => 'act_1']),
                ),
                'never stored',
            );
        }

        $this->assertSame([], $fx->store->all('audit_log'));
        $this->assertSame([], $fx->store->all('action_probe'));
    }

    public function testABankAccountIsRefusedAndNothingIsWritten(): void
    {
        $fx = new AuditFixture();

        $payloads = [
            ['bank_account_number' => '1234567890'],
            ['iban' => 'ZA12345678901234567890'],
        ];

        foreach ($payloads as $payload) {
            $this->assertThrows(
                AuditRefused::class,
                fn () => $fx->trail->record(
                    $fx->record(after: $payload),
                    fn () => $fx->store->insert('action_probe', ['id' => 'act_1']),
                ),
                'never stored',
            );
        }

        $this->assertSame([], $fx->store->all('audit_log'));
    }

    public function testEveryActorKindIsRecorded(): void
    {
        $fx = new AuditFixture();
        $fx->writeEveryActorKind();

        $this->assertCount(5, $fx->log->all());

        $kinds = array_values(array_unique(array_map(
            static fn ($entry): string => $entry->actorKind->value,
            $fx->log->all(),
        )));
        sort($kinds);

        $this->assertSame(['buyer', 'seller', 'staff', 'system'], $kinds);
        $this->assertSame(
            ['buyer', 'seller', 'staff', 'system'],
            ActorKind::values(),
            'the stored vocabulary and the enum must not drift',
        );
    }

    public function testAnUnknownActorKindAndAStaffActionWithoutACapabilityAreRefused(): void
    {
        $fx = new AuditFixture();

        $this->assertThrows(
            AuditRefused::class,
            fn () => $fx->trail->record(
                $fx->record(actorRole: 'admin'),
                fn () => $fx->store->insert('action_probe', ['id' => 'act_1']),
            ),
            'Unknown audit actor role',
        );

        $this->assertThrows(
            AuditRefused::class,
            fn () => $fx->trail->record(
                $fx->record(actorRole: 'staff', capability: ''),
                fn () => $fx->store->insert('action_probe', ['id' => 'act_1']),
            ),
            'capability',
        );

        $this->assertSame([], $fx->store->all('audit_log'));
        $this->assertSame([], $fx->store->all('action_probe'));
    }

    public function testAnImpersonatedSupportActionIsReconstructableFromOneRow(): void
    {
        $fx = new AuditFixture();
        $record = $fx->record(
            action: 'account.sanction',
            actorRole: 'staff',
            actorId: 'acc_staff_9',
            targetType: 'account',
            targetId: 'acc_buyer_7',
            subjectId: 'acc_buyer_7',
            capability: 'account.sanction',
            sessionId: 'ses_imp_9',
            reason: 'support call about a disputed order',
        );

        $fx->trail->record($record, static fn () => null);

        $entries = $fx->log->forTarget('account', 'acc_buyer_7');
        $this->assertCount(1, $entries);
        $entry = $entries[0];

        $this->assertSame(ActorKind::Staff, $entry->actorKind);
        $this->assertSame('acc_staff_9', $entry->actorId);
        $this->assertSame('acc_buyer_7', $entry->impersonatedAccountId);
        $this->assertSame('acc_buyer_7', $entry->subjectId);
        $this->assertSame('account.sanction', $entry->capability);
        $this->assertSame('ses_imp_9', $entry->sessionId);
        $this->assertTrue($entry->isImpersonation());
        $this->assertSame($entry->id, $fx->log->forRequest(AuditFixture::REQUEST)[0]->id);
        $this->assertSame('support call about a disputed order', $entry->reason);
    }

    public function testTheSinkJoinsACallersTransaction(): void
    {
        $fx = new AuditFixture();

        $fx->uow->begin();
        try {
            $fx->log->write($fx->record(action: 'listing.review'));
            $fx->store->insert('action_probe', ['id' => 'act_1']);
            $fx->uow->commit();
        } catch (\Throwable $failure) {
            $fx->uow->rollback();
            throw $failure;
        }

        $this->assertCount(1, $fx->store->all('audit_log'));
        $this->assertCount(1, $fx->store->all('action_probe'));
    }

    public function testAnAttemptCannotBeWrittenInsideTheTransactionItExplains(): void
    {
        $fx = new AuditFixture();
        $fx->uow->begin();

        $this->assertThrows(
            AuditRefused::class,
            fn () => $fx->log->writeAttempt($fx->record()),
            'rolled back',
        );

        $fx->uow->rollback();
        $this->assertSame([], $fx->store->all('audit_log'));
    }

    public function testARefusedAttemptSurvivesTheRollbackItDescribes(): void
    {
        $fx = new AuditFixture();
        $attempt = $fx->record(
            action: 'order.place',
            actorRole: 'buyer',
            actorId: 'acc_buyer_1',
            capability: null,
            sessionId: 'ses_buyer_1',
        );

        $this->assertThrows(\DomainException::class, function () use ($fx, $attempt): void {
            $fx->trail->attempt($attempt, function () use ($fx): void {
                $fx->store->insert('action_probe', ['id' => 'act_1', 'state' => 'attempted']);
                throw new \DomainException('stale order version');
            });
        }, 'stale order version');

        $this->assertCount(1, $fx->store->all('audit_log'), 'the attempt row outlives the rollback');
        $this->assertSame([], $fx->store->all('action_probe'), 'the action itself did not survive');
        $this->assertSame('order.place', $fx->log->all()[0]->action);
    }

    public function testAnAuditRowCannotBeWrittenOutsideATransaction(): void
    {
        $fx = new AuditFixture();

        $this->assertThrows(
            AuditRefused::class,
            fn () => $fx->log->write($fx->record()),
            'same transaction',
        );

        $this->assertSame([], $fx->store->all('audit_log'));
    }

    public function testTheLogIsAppendOnlyInTheStoreAndHasNoMutatingApi(): void
    {
        $fx = new AuditFixture();
        $fx->trail->record($fx->record(), static fn () => null);

        $row = $fx->store->all('audit_log')[0];

        $this->assertThrows(
            \DomainException::class,
            fn () => $fx->store->update('audit_log', array_merge($row, ['reason' => 'rewritten'])),
            'append-only',
        );
        $this->assertThrows(
            \DomainException::class,
            fn () => $fx->store->delete('audit_log', (string) $row['id']),
            'append-only',
        );

        $mutators = [];
        foreach ((new \ReflectionClass(AuditLog::class))->getMethods(\ReflectionMethod::IS_PUBLIC) as $method) {
            if (preg_match('/^(update|delete|edit|change|remove|purge|replace)/i', $method->getName()) === 1) {
                $mutators[] = $method->getName();
            }
        }
        $this->assertSame([], $mutators, 'the sink exposes no way to rewrite or remove a row');
        $this->assertSame('reviewed the listing photos', $fx->store->all('audit_log')[0]['reason']);
    }

    public function testTheRecordRollsBackWhenTheActionFails(): void
    {
        $fx = new AuditFixture();

        $this->assertThrows(\DomainException::class, function () use ($fx): void {
            $fx->trail->record($fx->record(), function () use ($fx): void {
                $fx->store->insert('action_probe', ['id' => 'act_1']);
                throw new \DomainException('action failed');
            });
        }, 'action failed');

        $this->assertSame([], $fx->store->all('audit_log'), 'no audit row for an action that did not happen');
        $this->assertSame([], $fx->store->all('action_probe'));
    }

    public function testTheRecordRollsBackWhenTheCommitFails(): void
    {
        $fx = new AuditFixture();
        $fx->uow->failNextCommit(new \RuntimeException('commit failed'));

        $this->assertThrows(\RuntimeException::class, function () use ($fx): void {
            $fx->trail->record($fx->record(), function () use ($fx): void {
                $fx->store->insert('action_probe', ['id' => 'act_1']);
            });
        }, 'commit failed');

        $this->assertSame([], $fx->store->all('audit_log'));
        $this->assertSame([], $fx->store->all('action_probe'));
    }
}
