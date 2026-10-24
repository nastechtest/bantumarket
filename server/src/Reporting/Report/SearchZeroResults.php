<?php

declare(strict_types=1);

namespace NasTech\Reporting\Report;

use NasTech\Reporting\ReportName;
use NasTech\Reporting\ReportSnapshot;

/**
 * Search queries that returned nothing, by category.
 *
 * A zero-result query is demand, not failure; the report separates "the
 * catalogue had nothing" from "search was unavailable", which is the
 * distinction the edge's SEARCH_UNAVAILABLE error preserves. Only completed
 * searches reach this table.
 */
final class SearchZeroResults extends AbstractReport
{
    public function name(): ReportName
    {
        return ReportName::SearchZeroResults;
    }

    public function description(): string
    {
        return 'Zero-result search queries as a share of queries, per category.';
    }

    public function laggingSources(): array
    {
        return ['search_facts (SearchPerformed)'];
    }

    public function columns(): array
    {
        return [
            'category_id' => 'string',
            'queries' => 'integer',
            'zero_result_queries' => 'integer',
            'zero_result_rate_bps' => 'bps',
        ];
    }

    protected function compute(ReportSnapshot $snapshot): array
    {
        $buckets = [];
        foreach ($this->facts('search_facts', $snapshot) as $row) {
            $category = (string) $row['category_id'];
            if (!isset($buckets[$category])) {
                $buckets[$category] = ['queries' => 0, 'zero' => 0];
            }
            $buckets[$category]['queries']++;
            if ((int) $row['result_count'] === 0) {
                $buckets[$category]['zero']++;
            }
        }

        ksort($buckets);
        $rows = [];
        foreach ($buckets as $category => $bucket) {
            $rows[] = [
                'category_id' => $category,
                'queries' => $bucket['queries'],
                'zero_result_queries' => $bucket['zero'],
                'zero_result_rate_bps' => $this->bps($bucket['zero'], $bucket['queries']),
            ];
        }

        return $rows;
    }
}
