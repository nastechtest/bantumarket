/**
 * The two numbers this dashboard is allowed to claim, and the ones it is not.
 *
 * The exit test in brief 04 measures time-to-first-listing and listing→live. Those are the only
 * funnel metrics in the product today. Views and impressions are not evidence of anything a
 * seller can act on, the analytics plan never emits them per listing, and rendering a fake zero
 * next to real money teaches the seller to distrust the whole screen. They are excluded by
 * identity, and a test asserts they never leak into rendered output.
 */

export interface DurationMetric {
  readonly key: 'time_to_first_listing' | 'listing_to_live';
  readonly label: string;
  readonly milliseconds: number | null;
  /** True when the end timestamp is missing because the seller has not got there yet. */
  readonly pending: boolean;
  readonly detail: string;
}

export const VANITY_METRICS = [
  { key: 'views', reason: 'The analytics plan (brief 21) does not emit per-listing views; any number here would be invented.' },
  { key: 'impressions', reason: 'Buyer search does not emit impressions, and they are not evidence of interest.' },
  { key: 'saves', reason: 'Not instrumented. A save count would be a placeholder pretending to be data.' },
  { key: 'watchlists', reason: 'No watchlist exists in the buyer app yet.' },
] as const;

export type VanityMetricKey = (typeof VANITY_METRICS)[number]['key'];

function parse(instant: string): number | null {
  const ms = Date.parse(instant);
  return Number.isNaN(ms) ? null : ms;
}

export function durationBetween(start: string, end: string): number | null {
  const a = parse(start);
  const b = parse(end);
  if (a === null || b === null || b < a) return null;
  return b - a;
}

/** Sign-up → first listing submitted. Null while the seller has not listed. */
export function timeToFirstListing(joinedAt: string, firstListingAt: string | null): DurationMetric {
  if (firstListingAt === null) {
    return {
      key: 'time_to_first_listing',
      label: 'Time to first listing',
      milliseconds: null,
      pending: true,
      detail: 'Starts when you finish your first listing.',
    };
  }
  return {
    key: 'time_to_first_listing',
    label: 'Time to first listing',
    milliseconds: durationBetween(joinedAt, firstListingAt),
    pending: false,
    detail: 'From the day you joined to the moment you submitted your first listing.',
  };
}

/** First submission → went live (review included). Null while review is open. */
export function listingToLive(firstListingAt: string | null, wentLiveAt: string | null): DurationMetric {
  if (firstListingAt === null || wentLiveAt === null) {
    return {
      key: 'listing_to_live',
      label: 'Listing to live',
      milliseconds: null,
      pending: true,
      detail: firstListingAt === null ? 'Starts when you submit your first listing.' : 'Waiting for review. Nothing for you to do.',
    };
  }
  return {
    key: 'listing_to_live',
    label: 'Listing to live',
    milliseconds: durationBetween(firstListingAt, wentLiveAt),
    pending: false,
    detail: 'Includes the reviewer’s time. Slow reviews are our problem, not yours.',
  };
}

/** `2h 15m`, `3 days`, `under a minute` — never a decimal hour, it reads as a stopwatch. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 60_000) return 'under a minute';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

export function metricRows(snapshot: {
  seller: { joinedAt: string };
  firstListingAt: string | null;
  firstWentLiveAt: string | null;
}): readonly DurationMetric[] {
  return [
    timeToFirstListing(snapshot.seller.joinedAt, snapshot.firstListingAt),
    listingToLive(snapshot.firstListingAt, snapshot.firstWentLiveAt),
  ];
}
