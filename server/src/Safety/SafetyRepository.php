<?php

declare(strict_types=1);

namespace NasTech\Safety;

/**
 * Safety's persistence port.
 *
 * Deliberately narrow: no "all reports", no search, no enumeration. A body is
 * only reachable by id through SafetyService, which applies the visibility
 * rule; a repository method that returned every report would be a second
 * retrieval path with no rule on it.
 */
interface SafetyRepository
{
    public function saveReport(Report $report): void;

    public function findReport(string $reportId): ?Report;

    public function saveBlock(Block $block): void;

    public function findBlock(string $blockerId, string $blockedId): ?Block;

    /**
     * The block between two accounts in either direction, or null. This is the
     * query mayMessage() is built on.
     */
    public function findBlockBetweenEitherWay(string $accountA, string $accountB): ?Block;

    public function saveSanction(Sanction $sanction): void;

    public function findSanction(string $sanctionId): ?Sanction;

    public function appendDecision(SanctionDecision $decision): void;

    /**
     * @return list<SanctionDecision>
     */
    public function decisionsFor(string $sanctionId): array;
}
