import { describe, expect, it } from 'bun:test';
import {
  durationBetween,
  formatDuration,
  listingToLive,
  metricRows,
  timeToFirstListing,
  VANITY_METRICS,
} from './metrics-that-are-not-vanity.js';

describe('funnel metrics that are not vanity', () => {
  it('measures sign-up to first listing in milliseconds', () => {
    const metric = timeToFirstListing('2026-10-01T08:00:00+02:00', '2026-10-01T10:30:00+02:00');
    expect(metric.milliseconds).toBe(2.5 * 60 * 60 * 1000);
    expect(metric.pending).toBe(false);
  });

  it('a seller who has not listed yet is pending, not zero', () => {
    const metric = timeToFirstListing('2026-10-01T08:00:00+02:00', null);
    expect(metric.milliseconds).toBeNull();
    expect(metric.pending).toBe(true);
    expect(metric.detail).toMatch(/starts when/i);
  });

  it('listing → live includes review and is pending while review is open', () => {
    const open = listingToLive('2026-10-14T09:00:00+02:00', null);
    expect(open.pending).toBe(true);
    expect(open.detail).toMatch(/waiting for review/i);
    const done = listingToLive('2026-10-14T09:00:00+02:00', '2026-10-14T13:00:00+02:00');
    expect(done.milliseconds).toBe(4 * 60 * 60 * 1000);
  });

  it('refuses an inverted or unparseable interval instead of showing a negative', () => {
    expect(durationBetween('2026-10-02T00:00:00+02:00', '2026-10-01T00:00:00+02:00')).toBeNull();
    expect(durationBetween('not a date', '2026-10-01T00:00:00+02:00')).toBeNull();
  });

  it('formats durations for humans, not as decimal hours', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(30_000)).toBe('under a minute');
    expect(formatDuration(90 * 60_000)).toBe('1h 30m');
    expect(formatDuration(2 * 24 * 60 * 60_000)).toBe('2 days');
    expect(formatDuration(26 * 60 * 60_000)).toBe('1 day');
  });

  it('exposes exactly two rows, both measured by the exit test', () => {
    const rows = metricRows({ seller: { joinedAt: '2026-10-01T08:00:00+02:00' }, firstListingAt: null, firstWentLiveAt: null });
    expect(rows.map((r) => r.key)).toEqual(['time_to_first_listing', 'listing_to_live']);
  });

  it('views, impressions, saves and watchlists are excluded with a reason', () => {
    const keys = VANITY_METRICS.map((m) => m.key);
    expect(keys).toEqual(['views', 'impressions', 'saves', 'watchlists']);
    for (const metric of VANITY_METRICS) expect(metric.reason.length).toBeGreaterThan(30);
  });
});
