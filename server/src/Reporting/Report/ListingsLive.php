<?php

declare(strict_types=1);

namespace NasTech\Reporting\Report;

use NasTech\Reporting\ReportName;
use NasTech\Reporting\ReportSnapshot;

/**
 * Live listings, and how many of them carry media.
 *
 * "Live with media" requires the media event to be inside the snapshot too;
 * counting a listing whose first photo arrived after the as-of would report a
 * catalogue quality the buyer could not have seen at that time.
 */
final class ListingsLive extends AbstractReport
{
    public function name(): ReportName
    {
        return ReportName::ListingsLive;
    }

    public function description(): string
    {
        return 'Listings live at the snapshot, with media coverage.';
    }

    public function laggingSources(): array
    {
        return ['listing_facts (ListingWentLive, ListingMediaAttached)'];
    }

    public function columns(): array
    {
        return [
            'live_listings' => 'integer',
            'live_with_media' => 'integer',
            'media_coverage_bps' => 'bps',
        ];
    }

    protected function compute(ReportSnapshot $snapshot): array
    {
        $live = 0;
        $withMedia = 0;
        foreach ($this->store->all('listing_facts') as $row) {
            $liveAt = $this->timestamp($row['live_at'] ?? null);
            if ($liveAt === null || $liveAt > $snapshot->asOf) {
                continue;
            }
            $liveIngested = $this->timestamp($row['live_ingested_at'] ?? null);
            if ($liveIngested === null || $liveIngested > $snapshot->ingestedThrough) {
                continue;
            }
            $live++;
            $mediaAt = $this->timestamp($row['first_media_at'] ?? null);
            $mediaIngested = $this->timestamp($row['media_ingested_at'] ?? null);
            if ($mediaAt !== null && $mediaAt <= $snapshot->asOf
                && $mediaIngested !== null && $mediaIngested <= $snapshot->ingestedThrough) {
                $withMedia++;
            }
        }

        return [[
            'live_listings' => $live,
            'live_with_media' => $withMedia,
            'media_coverage_bps' => $this->bps($withMedia, $live),
        ]];
    }
}
