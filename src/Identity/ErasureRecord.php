<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * The record of one POPIA erasure: who decided it, why, when, and what
 * happened to every column.
 *
 * `columnChanges` is data, not a README paragraph: a POPIA s.24 assistance
 * request ("what did you do with my data?") is answered by reading this row.
 * It maps a qualified column to one of three outcomes — `null`, `hash`, or
 * `kept` — and the erasure command builds it from the same operations it
 * performs, so the record cannot claim a treatment the code did not apply.
 *
 * Append-only: an erasure that can be edited is an erasure that can be denied.
 */
final class ErasureRecord
{
    /** @var array<string, string> */
    public const OUTCOMES = ['kept' => 'kept', 'null' => 'null', 'hash' => 'hash'];

    /**
     * @param array<string, string> $columnChanges
     */
    private function __construct(
        public readonly string $id,
        public readonly string $accountId,
        public readonly string $actorAccountId,
        public readonly string $reason,
        public readonly \DateTimeImmutable $erasedAt,
        public readonly array $columnChanges,
    ) {
    }

    /**
     * @param array<string, string> $columnChanges
     */
    public static function create(
        string $id,
        string $accountId,
        string $actorAccountId,
        string $reason,
        array $columnChanges,
        \DateTimeImmutable $now,
    ): self {
        $trimmedReason = trim($reason);
        if ($trimmedReason === '') {
            throw new \InvalidArgumentException('An erasure states its reason; "requested" alone is not one');
        }
        if ($columnChanges === []) {
            throw new \InvalidArgumentException('An erasure record names at least one column outcome');
        }
        foreach ($columnChanges as $column => $outcome) {
            if (!isset(self::OUTCOMES[$outcome])) {
                throw new \InvalidArgumentException(sprintf(
                    'Unknown erasure outcome "%s" for %s; expected null, hash or kept',
                    $outcome,
                    $column,
                ));
            }
        }

        return new self(
            id: $id,
            accountId: $accountId,
            actorAccountId: $actorAccountId,
            reason: $trimmedReason,
            erasedAt: $now,
            columnChanges: $columnChanges,
        );
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        $decoded = $row['column_changes'];
        /** @var array<string,string> $changes */
        $changes = is_array($decoded) ? $decoded : (array) json_decode((string) $decoded, true);

        return new self(
            id: (string) $row['id'],
            accountId: (string) $row['account_id'],
            actorAccountId: (string) $row['actor_account_id'],
            reason: (string) $row['reason'],
            erasedAt: new \DateTimeImmutable((string) $row['erased_at']),
            columnChanges: $changes,
        );
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'account_id' => $this->accountId,
            'actor_account_id' => $this->actorAccountId,
            'reason' => $this->reason,
            'erased_at' => $this->erasedAt->format(\DateTimeInterface::ATOM),
            'column_changes' => $this->columnChanges,
        ];
    }
}
