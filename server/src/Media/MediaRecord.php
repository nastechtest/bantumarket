<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * A media record: an immutable fact set about bytes that exist.
 *
 * The record is the fact, the bucket object is the content, and the two are bound
 * together by the digest — which is why `storageKey` is derived rather than
 * supplied, and why loading a row whose key does not match its own digest throws
 * instead of returning something a gallery could render. A record is never edited
 * into representing different bytes: a re-shoot or a re-encode is a new record with
 * a new digest, so a dispute can be answered with the exact asset a buyer saw.
 *
 * Two invariants here are the ones the brief is really about, and both exist twice:
 *
 * 1. A record whose digest does not match its bytes cannot reach PUBLISHED.
 *    Domain: markVerified() compares and throws; publish() refuses unless
 *    digestVerified. Storage: `only_a_verified_digest_leaves_staged` in
 *    db/migrations/003_media.sql refuses the row whatever wrote it.
 * 2. An `evidence` record is never publicly renderable.
 *    Domain: publish() refuses, and SignedUrlIssuer refuses the public audience.
 *    Storage: `evidence_is_never_published` refuses the row.
 *
 * What this class does not know: listings, orders, captures, disputes. Other
 * modules name media ids; nothing here names theirs (ADR 0002, and
 * config/module-boundaries.php gives Media no outbound edges).
 */
final class MediaRecord
{
    private const MIME_PATTERN = '#^[a-z0-9.+-]+/[a-z0-9.+-]+$#';

    /** @var list<string> events applied since load, for the tests that assert a path */
    private array $eventsApplied = [];

    /**
     * The version this aggregate was loaded at. Optimistic locking compares the
     * stored row against *that*, not against the current version minus one, so a
     * transaction may apply several changes to one record and still be safe.
     */
    private int $loadedVersion;

    private function __construct(
        public readonly string $id,
        public string $ownerAccountId,
        public readonly Purpose $purpose,
        public MediaState $state,
        public readonly Digest $digest,
        public readonly StorageKey $storageKey,
        public readonly int $sizeBytes,
        public readonly string $mime,
        public readonly ?int $widthPx,
        public readonly ?int $heightPx,
        public readonly ?string $colourProfile,
        public readonly ?string $sourceDevice,
        public readonly ?string $captureStation,
        public readonly RetentionClass $retentionClass,
        public readonly string $retentionReason,
        public readonly ?RenditionKind $renditionKind,
        public readonly ?LodTier $lodTier,
        public readonly ?string $sourceRecordId,
        public bool $digestVerified,
        public int $version,
        public readonly \DateTimeImmutable $createdAt,
        public ?\DateTimeImmutable $verifiedAt,
        public ?\DateTimeImmutable $publishedAt,
        public ?\DateTimeImmutable $retiredAt,
        public ?string $rejectReason,
        public ?string $retirementReason,
        public ?\DateTimeImmutable $erasureRequestedAt,
        public ?\DateTimeImmutable $purgeAfterAt,
    ) {
    }

    /**
     * Stage a record for bytes that have been written to the content-addressed
     * store. The caller declares the digest; the verification command later proves
     * it, and this constructor is where the declaration is pinned to a shape.
     */
    public static function stage(
        string $id,
        string $ownerAccountId,
        Purpose $purpose,
        Digest $declaredDigest,
        int $sizeBytes,
        string $mime,
        RetentionClass $retentionClass,
        string $retentionReason,
        \DateTimeImmutable $at,
        ?int $widthPx = null,
        ?int $heightPx = null,
        ?string $colourProfile = null,
        ?string $sourceDevice = null,
        ?string $captureStation = null,
        ?RenditionKind $renditionKind = null,
        ?LodTier $lodTier = null,
        ?string $sourceRecordId = null,
    ): self {
        $record = new self(
            id: $id,
            ownerAccountId: $ownerAccountId,
            purpose: $purpose,
            state: MediaState::STAGED,
            digest: $declaredDigest,
            storageKey: StorageKey::forContent($declaredDigest),
            sizeBytes: $sizeBytes,
            mime: $mime,
            widthPx: $widthPx,
            heightPx: $heightPx,
            colourProfile: $colourProfile,
            sourceDevice: $sourceDevice,
            captureStation: $captureStation,
            retentionClass: $retentionClass,
            retentionReason: $retentionReason,
            renditionKind: $renditionKind,
            lodTier: $lodTier,
            sourceRecordId: $sourceRecordId,
            digestVerified: false,
            version: 1,
            createdAt: $at,
            verifiedAt: null,
            publishedAt: null,
            retiredAt: null,
            rejectReason: null,
            retirementReason: null,
            erasureRequestedAt: null,
            purgeAfterAt: null,
        );

        $record->loadedVersion = 1;
        $record->assertSane();

        return $record;
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        $digest = Digest::fromHex((string) $row['sha256']);
        $storedKey = StorageKey::fromStored((string) $row['storage_key']);

        // The row is the untrusted party here. A key that does not name its own
        // digest — edited in psql, or written by a migration that got the derivation
        // wrong — would serve different bytes under an address the platform trusts.
        $expected = StorageKey::forContent($digest);
        if (!$storedKey->equals($expected)) {
            throw new MediaRefused(sprintf(
                'Media %s stores %s, which is not the content address of sha256 %s (%s). '
                . 'Refusing to load a record whose bytes are not the bytes its key names.',
                (string) $row['id'],
                $storedKey->value,
                $digest->shortDisplay(),
                $expected->value,
            ));
        }

        $state = MediaState::tryFrom((string) $row['state']);
        if ($state === null) {
            throw new MediaRefused('Media ' . $row['id'] . ' holds a state this module cannot interpret: ' . $row['state']);
        }

        $record = new self(
            id: (string) $row['id'],
            ownerAccountId: (string) $row['owner_account_id'],
            purpose: self::purposeFrom((string) $row['purpose'], (string) $row['id']),
            state: $state,
            digest: $digest,
            storageKey: $storedKey,
            sizeBytes: (int) $row['size_bytes'],
            mime: (string) $row['mime'],
            widthPx: $row['width_px'] === null ? null : (int) $row['width_px'],
            heightPx: $row['height_px'] === null ? null : (int) $row['height_px'],
            colourProfile: $row['colour_profile'] === null ? null : (string) $row['colour_profile'],
            sourceDevice: $row['source_device'] === null ? null : (string) $row['source_device'],
            captureStation: $row['capture_station'] === null ? null : (string) $row['capture_station'],
            retentionClass: self::retentionFrom((string) $row['retention_class'], (string) $row['id']),
            retentionReason: (string) $row['retention_reason'],
            renditionKind: $row['rendition_kind'] === null
                ? null
                : self::renditionKindFrom((string) $row['rendition_kind'], (string) $row['id']),
            lodTier: $row['lod_tier'] === null ? null : self::lodTierFrom((string) $row['lod_tier'], (string) $row['id']),
            sourceRecordId: $row['source_asset_id'] === null ? null : (string) $row['source_asset_id'],
            digestVerified: (bool) $row['digest_verified'],
            version: (int) $row['version'],
            createdAt: new \DateTimeImmutable((string) $row['created_at']),
            verifiedAt: $row['verified_at'] === null ? null : new \DateTimeImmutable((string) $row['verified_at']),
            publishedAt: $row['published_at'] === null ? null : new \DateTimeImmutable((string) $row['published_at']),
            retiredAt: $row['retired_at'] === null ? null : new \DateTimeImmutable((string) $row['retired_at']),
            rejectReason: $row['reject_reason'] === null ? null : (string) $row['reject_reason'],
            retirementReason: $row['retirement_reason'] === null ? null : (string) $row['retirement_reason'],
            erasureRequestedAt: $row['erasure_requested_at'] === null
                ? null
                : new \DateTimeImmutable((string) $row['erasure_requested_at']),
            purgeAfterAt: $row['purge_after_at'] === null ? null : new \DateTimeImmutable((string) $row['purge_after_at']),
        );

        $record->eventsApplied = [];
        $record->loadedVersion = $record->version;
        $record->assertSane();

        return $record;
    }

    /**
     * Prove the declared digest against the bytes at the content address.
     *
     * The observed digest comes in rather than being read here, because the caller
     * is the only party holding the stored bytes; passing it in keeps this method a
     * comparison, which is what a test can pin.
     */
    public function markVerified(Digest $observedDigest, \DateTimeImmutable $at): void
    {
        if (!$observedDigest->equals($this->digest)) {
            throw DigestMismatch::between($this->digest, $observedDigest, $this->id);
        }

        $this->apply(MediaTransitions::EV_VERIFY, $at);
        $this->digestVerified = true;
        $this->verifiedAt = $at;
    }

    /**
     * Drive the record to REJECTED. Reachable from STAGED (a mismatch found at
     * verification) and from VERIFIED (a doubt raised afterwards); it is not
     * reachable from PUBLISHED, which is Retire's job — a record that was seen by
     * buyers is withdrawn, not denied.
     */
    public function markRejected(string $reason, \DateTimeImmutable $at): void
    {
        if (trim($reason) === '') {
            throw new MediaRefused(
                'A rejection must say why. `a_rejection_says_why` is the same rule in the DDL, '
                . 'and the reason is the sentence a dispute reads a year later.'
            );
        }

        $this->apply(MediaTransitions::EV_REJECT, $at);
        $this->rejectReason = $reason;
    }

    /**
     * Publish: make the record renderable to a buyer.
     *
     * Three refusals, and the third is the one the brief asks for. A purpose that
     * is not publicly renderable has no path to PUBLISHED at any version of any
     * future code, because this is where the purpose vocabulary is read.
     */
    public function publish(\DateTimeImmutable $at): void
    {
        if (!$this->digestVerified) {
            throw new MediaRefused(sprintf(
                'Media %s has not been verified against its bytes; publishing it would show '
                . 'content nobody has proved exists.',
                $this->id,
            ));
        }
        if (!$this->purpose->isPubliclyRenderable()) {
            throw new MediaRefused(sprintf(
                'Media %s is purpose %s and may never be published: an evidence record is read '
                . 'by a named reviewer, not rendered in a gallery.',
                $this->id,
                $this->purpose->value,
            ));
        }

        $this->apply(MediaTransitions::EV_PUBLISH, $at);
        $this->publishedAt = $at;
    }

    /** Withdraw a record. The bytes stay; a buyer who saw them must remain findable. */
    public function retire(string $reason, \DateTimeImmutable $at): void
    {
        if (trim($reason) === '') {
            throw new MediaRefused('A retirement must say why — `a_retirement_says_why` in the DDL.');
        }

        $this->apply(MediaTransitions::EV_RETIRE, $at);
        $this->retirementReason = $reason;
        $this->retiredAt = $at;
    }

    /**
     * An account erasure touched this record: mark it, and replace the owner
     * reference with a keyed pseudonym. The record and its bytes survive, because
     * retention here is owed to a dispute, not to the account.
     *
     * @param string $ownerPseudonym Derived by EraseAccountMedia with a pepper the
     *                               application holds; never the account id.
     */
    public function markErasureRequested(string $ownerPseudonym, \DateTimeImmutable $at): void
    {
        if (trim($ownerPseudonym) === '') {
            throw new MediaRefused('Erasure must leave a pseudonym, not an empty owner.');
        }

        $this->ownerAccountId = $ownerPseudonym;
        $this->erasureRequestedAt = $at;
        $this->version++;
    }

    /**
     * Schedule the physical purge. Only a class the platform may throw away on a
     * timer gets a date; the refusal is the reason an evidence record survives the
     * sweep that deletes its owner's holiday photographs.
     */
    public function schedulePurge(\DateTimeImmutable $after): void
    {
        if (!$this->retentionClass->mayCarryPurgeDate()) {
            throw new RetentionRefused(sprintf(
                'Media %s is retention class %s and may not be scheduled for purge at all. '
                . 'The erasure request marks it; nothing deletes it.',
                $this->id,
                $this->retentionClass->value,
            ));
        }

        $this->purgeAfterAt = $after;
        $this->version++;
    }

    public function mayBeReadPublicly(): bool
    {
        return $this->state === MediaState::PUBLISHED
            && $this->digestVerified
            && $this->purpose->isPubliclyRenderable()
            && $this->erasureRequestedAt === null;
    }

    /**
     * The purge sweep's gate, stated as a refusal rather than a boolean so the
     * reason reaches the log that an operator reads.
     */
    public function assertPurgeableAt(\DateTimeImmutable $at): void
    {
        if ($this->purpose === Purpose::EVIDENCE) {
            throw new RetentionRefused(sprintf(
                'Media %s is evidence in a dispute record and will not be deleted, whatever date '
                . 'is on it. POPIA s.14 keeps a record a law or a dispute needs.',
                $this->id,
            ));
        }
        if ($this->retentionClass->survivesErasure()) {
            throw new RetentionRefused(sprintf(
                'Media %s is held under retention class %s; its retention outlives the account.',
                $this->id,
                $this->retentionClass->value,
            ));
        }
        if ($this->purgeAfterAt === null) {
            throw new RetentionRefused(sprintf(
                'Media %s has no purge date. Nothing scheduled it for deletion, so nothing deletes it.',
                $this->id,
            ));
        }
        if ($at < $this->purgeAfterAt) {
            throw new RetentionRefused(sprintf(
                'Media %s is not purgeable until %s.',
                $this->id,
                $this->purgeAfterAt->format(\DateTimeInterface::ATOM),
            ));
        }
    }

    public function isRendition(): bool
    {
        return $this->renditionKind !== null;
    }

    public function loadedVersion(): int
    {
        return $this->loadedVersion;
    }

    /**
     * The version this aggregate believes is current — what a caller passes to a
     * state-changing command, and what the repository compares against the stored
     * row. `media.assets_version_monotonic` refuses the same write at the storage
     * layer, so code that forgot to compare still cannot roll a record backwards.
     */
    public function expectedVersion(): int
    {
        return $this->loadedVersion;
    }

    public function can(string $event): bool
    {
        return MediaTransitions::machine()->can($this->state->value, $event);
    }

    /** @return list<string> */
    public function eventsApplied(): array
    {
        return $this->eventsApplied;
    }

    /** @return array<string,mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'owner_account_id' => $this->ownerAccountId,
            'purpose' => $this->purpose->value,
            'state' => $this->state->value,
            'sha256' => $this->digest->hex,
            'storage_key' => $this->storageKey->value,
            'size_bytes' => $this->sizeBytes,
            'mime' => $this->mime,
            'width_px' => $this->widthPx,
            'height_px' => $this->heightPx,
            'colour_profile' => $this->colourProfile,
            'source_device' => $this->sourceDevice,
            'capture_station' => $this->captureStation,
            'retention_class' => $this->retentionClass->value,
            'retention_reason' => $this->retentionReason,
            'rendition_kind' => $this->renditionKind?->value,
            'lod_tier' => $this->lodTier?->value,
            'source_asset_id' => $this->sourceRecordId,
            'digest_verified' => $this->digestVerified,
            'version' => $this->version,
            'created_at' => $this->createdAt->format(\DateTimeInterface::ATOM),
            'verified_at' => $this->verifiedAt?->format(\DateTimeInterface::ATOM),
            'published_at' => $this->publishedAt?->format(\DateTimeInterface::ATOM),
            'retired_at' => $this->retiredAt?->format(\DateTimeInterface::ATOM),
            'reject_reason' => $this->rejectReason,
            'retirement_reason' => $this->retirementReason,
            'erasure_requested_at' => $this->erasureRequestedAt?->format(\DateTimeInterface::ATOM),
            'purge_after_at' => $this->purgeAfterAt?->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * The column rules the DDL also declares, checked here so a handler fails in
     * PHP with a sentence rather than in commit() with a constraint name.
     */
    private function assertSane(): void
    {
        if (trim($this->ownerAccountId) === '') {
            throw new MediaRefused("Media {$this->id} must be owned by exactly one account");
        }
        if ($this->sizeBytes <= 0) {
            throw new MediaRefused(sprintf(
                'Media %s declares %d bytes. A zero-byte object is not an asset, and a record for '
                . 'one is a rendition that was never produced.',
                $this->id,
                $this->sizeBytes,
            ));
        }
        if (preg_match(self::MIME_PATTERN, $this->mime) !== 1) {
            throw new MediaRefused("Media {$this->id} has a mime that is not a type/subtype pair: {$this->mime}");
        }
        if (trim($this->retentionReason) === '') {
            throw new MediaRefused(
                "Media {$this->id} must state why it is kept. `retention_reason_is_mandatory` "
                . 'is the same rule in the DDL.'
            );
        }
        if (($this->widthPx === null) !== ($this->heightPx === null)) {
            throw new MediaRefused("Media {$this->id} has one of width/height and not the other");
        }

        if ($this->renditionKind === null) {
            if ($this->lodTier !== null) {
                throw new MediaRefused("Media {$this->id} carries a lod tier with no rendition kind");
            }
            if ($this->sourceRecordId !== null) {
                throw new MediaRefused(
                    "Media {$this->id} is a source record and cannot hang off another record; "
                    . '`a_source_hangs_off_nothing` is the same rule in the DDL.'
                );
            }
        } else {
            if ($this->lodTier === null) {
                throw new MediaRefused("Media {$this->id} is a {$this->renditionKind->value} rendition with no lod tier");
            }
            if ($this->sourceRecordId === null) {
                throw new MediaRefused("Media {$this->id} is a rendition and must hang off a source record");
            }
            if ($this->sourceRecordId === $this->id) {
                throw new MediaRefused("Media {$this->id} is its own source");
            }
        }

        if ($this->purpose === Purpose::EVIDENCE) {
            if ($this->captureStation === null || trim($this->captureStation) === '') {
                throw new MediaRefused(
                    "Evidence {$this->id} must record where it was shot. `evidence_says_where_it_was_shot` "
                    . 'is the same rule in the DDL, and a chain of custody with no station is not custody.'
                );
            }
            if (!$this->retentionClass->survivesErasure()) {
                throw new MediaRefused(sprintf(
                    'Evidence %s cannot be retention class %s: evidence outlives the account that filed it.',
                    $this->id,
                    $this->retentionClass->value,
                ));
            }
        }

        if (!$this->retentionClass->mayCarryPurgeDate() && $this->purgeAfterAt !== null) {
            throw new MediaRefused(sprintf(
                'Media %s is retention class %s and cannot carry a purge date — '
                . '`purge_never_scheduled_on_evidence` in the DDL.',
                $this->id,
                $this->retentionClass->value,
            ));
        }

        if ($this->state->impliesDigestVerified() && !$this->digestVerified) {
            throw new MediaRefused(sprintf(
                'Media %s is %s with digest_verified false, which is a row that has been pushed '
                . 'past verification by something that did not verify it.',
                $this->id,
                $this->state->value,
            ));
        }

        if ($this->state === MediaState::REJECTED && trim((string) $this->rejectReason) === '') {
            throw new MediaRefused("Media {$this->id} is REJECTED with no stated reason");
        }
    }

    private function apply(string $event, \DateTimeImmutable $at): void
    {
        $this->state = MediaState::from(MediaTransitions::machine()->next($this->state->value, $event));
        $this->eventsApplied[] = $event;
        $this->version++;
    }

    private static function purposeFrom(string $value, string $id): Purpose
    {
        return Purpose::tryFrom($value)
            ?? throw new MediaRefused("Media {$id} carries a purpose this module cannot interpret: {$value}");
    }

    private static function retentionFrom(string $value, string $id): RetentionClass
    {
        return RetentionClass::tryFrom($value)
            ?? throw new MediaRefused("Media {$id} carries a retention class it cannot interpret: {$value}");
    }

    private static function renditionKindFrom(string $value, string $id): RenditionKind
    {
        return RenditionKind::tryFrom($value)
            ?? throw new MediaRefused("Media {$id} carries a rendition kind the contract does not define: {$value}");
    }

    private static function lodTierFrom(string $value, string $id): LodTier
    {
        return LodTier::tryFrom($value)
            ?? throw new MediaRefused("Media {$id} carries a lod tier the contract does not define: {$value}");
    }
}
