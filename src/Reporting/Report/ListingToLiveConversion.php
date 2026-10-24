<?php

declare(strict_types=1);

namespace NasTech\Reporting\Report;

use NasTech\Reporting\ReportName;
use NasTech\Reporting\ReportSnapshot;

/**
 * Listing -> live conversion, by category.
 *
 * Both sides of the ratio are snapshot-filtered separately: a listing created
 * before the as-of but published after it is a created listing that had not
 * converted *yet*, which is the honest reading. Counting it as a failure would
 * make a slow category look like a broken one.
 */
final class ListingToLiveConversion extends AbstractReport
{
    public function name(): ReportName
    {
        return ReportName::ListingToLiveConversion;
    }

    public function description(): string
    {
        return 'Listings that reached live, as a share of listings created.';
    }

    public function laggingSources(): array
    {
        return ['listing_facts (ListingCreated, ListingWentLive)'];
    }

    public function columns(): array
    {
        return [
            'category_id' => 'string',
            'created' => 'integer',
            'live' => 'integer',
            'conversion_bps' => 'bps',
        ];
    }

    protected function compute(ReportSnapshot $snapshot): array
    {
        $created = [];
        foreach ($this->facts('listing_facts', $snapshot, 'created_at', 'created_ingested_at') as $row) {
            $category = (string) $row['category_id'];
            $created[$category] = ($created[$category] ?? 0) + 1;
        }

        $live = [];
        foreach ($this->facts('listing_facts', $snapshot, 'live_at', 'live_ingested_at') as $row) {
            $category = (string) $row['category_id'];
            $live[$category] = ($live[$category] ?? 0) + 1;
        }

        $categories = array_keys($created + $live);
        sort($categories);

        $rows = [];
        foreach ($categories as $category) {
            $createdCount = $created[$category] ?? 0;
            $liveCount = $live[$category] ?? 0;
            $rows[] = [
                'category_id' => $category,
                'created' => $createdCount,
                'live' => $liveCount,
                'conversion_bps' => $this->bps($liveCount, $createdCount),
            ];
        }

        return $rows;
    }
}
