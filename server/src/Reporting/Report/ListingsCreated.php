<?php

declare(strict_types=1);

namespace NasTech\Reporting\Report;

use NasTech\Reporting\ReportName;
use NasTech\Reporting\ReportSnapshot;

/**
 * Listings created, by ISO week and category.
 *
 * Counts the creation event, not the current row: a listing withdrawn the next
 * day still happened, and the supply-side exit test is about what sellers
 * attempted, not what survived moderation.
 */
final class ListingsCreated extends AbstractReport
{
    public function name(): ReportName
    {
        return ReportName::ListingsCreated;
    }

    public function description(): string
    {
        return 'Listings created per ISO week and category.';
    }

    public function laggingSources(): array
    {
        return ['listing_facts (ListingCreated)'];
    }

    public function columns(): array
    {
        return ['week' => 'string', 'category_id' => 'string', 'listings_created' => 'integer'];
    }

    protected function compute(ReportSnapshot $snapshot): array
    {
        $buckets = [];
        foreach ($this->facts('listing_facts', $snapshot, 'created_at', 'created_ingested_at') as $row) {
            $created = new \DateTimeImmutable((string) $row['created_at']);
            $key = $created->format('o-\WW') . '|' . (string) $row['category_id'];
            if (!isset($buckets[$key])) {
                $buckets[$key] = [
                    'week' => $created->format('o-\WW'),
                    'category_id' => (string) $row['category_id'],
                    'listings_created' => 0,
                ];
            }
            $buckets[$key]['listings_created']++;
        }

        $rows = array_values($buckets);
        usort($rows, static fn (array $a, array $b): int => [$a['week'], $a['category_id']] <=> [$b['week'], $b['category_id']]);

        return $rows;
    }
}
