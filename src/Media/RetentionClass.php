<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * How long the bytes are kept, stated as a class rather than as a date.
 *
 * The classes are ordered by what they owe the platform, and the ordering is the
 * point: `TRANSIENT` is the only one a scheduler may delete on its own, and
 * `EVIDENCE`/`LEGAL_HOLD` are the ones that outlive the account that created
 * them. POPIA s.14 keeps a record because a law or a dispute needs it, not
 * because nobody got round to deleting it — so the reason is a column, not a
 * comment.
 */
enum RetentionClass: string
{
    /** An upload that never verified. Purged on a schedule; nothing depends on it. */
    case TRANSIENT = 'TRANSIENT';

    /** Ordinary listing media. Leaves with the listing or with an erasure request. */
    case LISTING = 'LISTING';

    /** A claim about an item's condition. Survives account erasure and listing removal. */
    case EVIDENCE = 'EVIDENCE';

    /** Held by an open dispute, sanction or legal instruction. Cannot be shortened. */
    case LEGAL_HOLD = 'LEGAL_HOLD';

    public function survivesErasure(): bool
    {
        return $this === self::EVIDENCE || $this === self::LEGAL_HOLD;
    }

    /**
     * Only a class the platform may throw away on a timer may carry a purge date.
     * The same rule is `purge_never_scheduled_on_evidence` in the DDL; a row with
     * both set is the shape of a bug where a scheduler deletes dispute evidence.
     */
    public function mayCarryPurgeDate(): bool
    {
        return !$this->survivesErasure();
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $c): string => $c->value, self::cases());
    }
}
