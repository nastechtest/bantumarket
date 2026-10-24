<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * POPIA erasure of one subject.
 *
 * The row survives; the person does not. Ids, created_at, role and the tier
 * grant stay because orders, ledger entries and impersonation logs join to
 * them and ECT Act s.15 / FIC obligations require the record of the
 * transaction to survive the person's exit. Every column that attributes
 * anything to the subject is either NULLed or replaced with a keyed HMAC:
 * a bare sha256 of a South African mobile number is reversible in an
 * afternoon, so the key is not optional.
 *
 * The command writes an erasure_records row whose column_changes map is built
 * from the same operations it performs — a POPIA s.24 assistance request is
 * answered by reading that row, not by trusting this docblock.
 *
 * Authorisation: a subject may erase themselves; anybody else needs
 * subject.erase. The capability map deliberately does not give buyers the
 * staff capability, because "I may delete my own account" and "I may delete
 * somebody's account" are different rights.
 */
final class EraseSubject
{
    public function __construct(
        private readonly AccountRepository $accounts,
        private readonly CredentialStore $credentials,
        private readonly ContactChannelStore $channels,
        private readonly AddressBookStore $addresses,
        private readonly SessionRegistry $sessions,
        private readonly ErasureRecordStore $records,
        private readonly PasswordHasher $hasher,
        private readonly Authorisation $authorisation,
        private readonly UnitOfWork $uow,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
        private readonly string $erasureKey,
    ) {
        if (strlen($erasureKey) < 32) {
            throw new \InvalidArgumentException('Erasure key must be at least 32 chars');
        }
    }

    public function handle(string $actorAccountId, string $subjectAccountId, string $reason): ErasureRecord
    {
        if ($actorAccountId !== $subjectAccountId) {
            $this->authorisation->require($actorAccountId, Capability::SUBJECT_ERASE);
        }

        $now = $this->clock->now();
        $this->uow->begin();

        try {
            $account = $this->accounts->require($subjectAccountId);
            if ($account->status === Account::STATUS_ERASED) {
                throw new \DomainException('This subject is already erased; erasure is terminal and not repeatable');
            }

            $changes = [
                'accounts.id' => 'kept',
                'accounts.created_at' => 'kept',
                'accounts.role' => 'kept',
                'accounts.tier' => 'kept',
                'accounts.tier_granted_by' => 'kept',
                'accounts.display_name' => 'null',
                'accounts.phone_e164' => 'hash',
            ];

            $credential = $this->credentials->forAccount($subjectAccountId);
            if ($credential !== null) {
                $credential->anonymise($this->hasher, $now);
                $this->credentials->save($credential);
                $changes['credentials.password_hash'] = 'hash';
                $changes['credentials.failed_attempts'] = 'kept';
            }

            foreach ($this->channels->forAccount($subjectAccountId) as $channel) {
                $channel->anonymise($this->erasureKey);
                $this->channels->save($channel);
                $changes['contact_channels.target'] = 'hash';
                $changes['contact_channels.verified_at'] = 'null';
                $changes['contact_channels.consent_marketing'] = 'null';
                $changes['contact_channels.consent_transactional'] = 'null';
            }

            foreach ($this->addresses->forAccount($subjectAccountId) as $address) {
                $address->anonymise();
                $this->addresses->save($address);
                $changes['address_book.recipient_name'] = 'null';
                $changes['address_book.line1'] = 'null';
                $changes['address_book.line2'] = 'null';
                $changes['address_book.locality'] = 'null';
                $changes['address_book.province_code'] = 'null';
                $changes['address_book.postal_code'] = 'null';
                $changes['address_book.label'] = 'null';
            }

            $this->sessions->anonymiseForAccount($subjectAccountId, $now);
            $changes['sessions.device_label'] = 'null';
            $changes['sessions.remote_ip_hash'] = 'null';
            $changes['sessions.token_hash'] = 'kept';

            $account->anonymise($this->erasureKey, $now);
            $this->accounts->save($account);

            $record = ErasureRecord::create(
                id: Id::generate('ers')->value(),
                accountId: $subjectAccountId,
                actorAccountId: $actorAccountId,
                reason: $reason,
                columnChanges: $changes,
                now: $now,
            );
            $this->records->append($record);

            $this->outbox->publish('Account', $subjectAccountId, 'SubjectErased', [
                'account_id' => $subjectAccountId,
                'erased_by' => $actorAccountId,
                'erasure_record_id' => $record->id,
                'erased_at' => $now->format(\DateTimeInterface::ATOM),
                // The reason is operator evidence in the append-only record;
                // it is not copied into a fan-out event.
            ]);

            $this->uow->commit();

            return $record;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }
}
