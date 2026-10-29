<?php

declare(strict_types=1);

namespace NasTech\Safety;

use NasTech\SharedKernel\Persistence\Store;

/**
 * The Store-backed implementation this environment runs.
 *
 * The two append-only tables are enforced by the store (and by the DDL when
 * PostgreSQL is present); the save methods for mutable aggregates use update
 * on an existing row and insert on a new one, the same shape as every other
 * module's in-memory repository.
 */
final class InMemorySafetyRepository implements SafetyRepository
{
    public const REPORT_TABLE = 'safety_reports';
    public const BLOCK_TABLE = 'safety_blocks';
    public const SANCTION_TABLE = 'safety_sanctions';
    public const DECISION_TABLE = 'safety_sanction_decisions';

    public function __construct(private readonly Store $store)
    {
    }

    public function saveReport(Report $report): void
    {
        $row = $report->toRow();
        if ($this->store->find(self::REPORT_TABLE, $report->id) === null) {
            $this->store->insert(self::REPORT_TABLE, $row);

            return;
        }
        $this->store->update(self::REPORT_TABLE, $row);
    }

    public function findReport(string $reportId): ?Report
    {
        $row = $this->store->find(self::REPORT_TABLE, $reportId);

        return $row === null ? null : Report::fromRow($row);
    }

    public function saveBlock(Block $block): void
    {
        if ($this->store->find(self::BLOCK_TABLE, $block->id) === null) {
            $this->store->insert(self::BLOCK_TABLE, $block->toRow());

            return;
        }
        $this->store->update(self::BLOCK_TABLE, $block->toRow());
    }

    public function findBlock(string $blockerId, string $blockedId): ?Block
    {
        foreach ($this->store->all(self::BLOCK_TABLE) as $row) {
            if ((string) $row['blocker_id'] === $blockerId && (string) $row['blocked_id'] === $blockedId) {
                return Block::fromRow($row);
            }
        }

        return null;
    }

    public function findBlockBetweenEitherWay(string $accountA, string $accountB): ?Block
    {
        foreach ($this->store->all(self::BLOCK_TABLE) as $row) {
            $blocker = (string) $row['blocker_id'];
            $blocked = (string) $row['blocked_id'];
            if (($blocker === $accountA && $blocked === $accountB)
                || ($blocker === $accountB && $blocked === $accountA)) {
                return Block::fromRow($row);
            }
        }

        return null;
    }

    public function saveSanction(Sanction $sanction): void
    {
        if ($this->store->find(self::SANCTION_TABLE, $sanction->id) === null) {
            $this->store->insert(self::SANCTION_TABLE, $sanction->toRow());

            return;
        }
        $this->store->update(self::SANCTION_TABLE, $sanction->toRow());
    }

    public function findSanction(string $sanctionId): ?Sanction
    {
        $row = $this->store->find(self::SANCTION_TABLE, $sanctionId);

        return $row === null ? null : Sanction::fromRow($row);
    }

    public function appendDecision(SanctionDecision $decision): void
    {
        $this->store->insert(self::DECISION_TABLE, $decision->toRow());
    }

    /**
     * @return list<SanctionDecision>
     */
    public function decisionsFor(string $sanctionId): array
    {
        $decisions = [];
        foreach ($this->store->all(self::DECISION_TABLE) as $row) {
            if ((string) $row['sanction_id'] === $sanctionId) {
                $decisions[] = SanctionDecision::fromRow($row);
            }
        }
        usort(
            $decisions,
            static fn (SanctionDecision $a, SanctionDecision $b): int => $a->decidedAt <=> $b->decidedAt,
        );

        return $decisions;
    }
}
