<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Record what the subject answered about one channel and one purpose.
 *
 * Marketing and transactional consent are separate columns because they are
 * separate permissions. `null` is an answer — "never asked" — and must not be
 * collapsed into `false`, which means "asked and refused"; POPIA treats them
 * differently and so does the notification worker.
 *
 * Recording consent does not send anything and does not prove the channel. The
 * send rule (proven and consented) belongs to the module that sends.
 */
final class RecordContactConsent
{
    public function __construct(
        private readonly ContactChannelStore $channels,
        private readonly UnitOfWork $uow,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
    ) {
    }

    public function handle(
        string $accountId,
        string $channelId,
        ?bool $marketing = null,
        ?bool $transactional = null,
    ): ContactChannel {
        if ($marketing === null && $transactional === null) {
            throw new \InvalidArgumentException('A consent record states at least one answer');
        }

        $now = $this->clock->now();
        $this->uow->begin();

        try {
            $channel = $this->channels->require($channelId);
            if ($channel->accountId !== $accountId) {
                throw new AccessDenied('Consent is recorded by the account that owns the channel');
            }
            if ($channel->isAnonymised()) {
                throw new \DomainException('An erased channel has no consent to record');
            }

            if ($marketing !== null) {
                $channel->recordMarketingConsent($marketing);
            }
            if ($transactional !== null) {
                $channel->recordTransactionalConsent($transactional);
            }
            $this->channels->save($channel);

            $this->outbox->publish('Account', $accountId, 'ContactConsentRecorded', [
                'account_id' => $accountId,
                'channel_id' => $channelId,
                'marketing' => $channel->consentMarketing,
                'transactional' => $channel->consentTransactional,
                'at' => $now->format(\DateTimeInterface::ATOM),
            ]);

            $this->uow->commit();

            return $channel;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }
}
