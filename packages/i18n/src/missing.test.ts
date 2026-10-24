/**
 * Gap reporting safety invariants — the two guarantees the brief calls out: it must never throw (a
 * content bug cannot blank a page), and it must never record the surrounding user text (a gap report is
 * telemetry about a missing key, not an archive of listing titles or offer amounts).
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { recordGap, getGapReport, onGap, resetGaps } from './missing.js';

describe('missing gap reporting', () => {
  beforeEach(() => resetGaps());

  it('records key / locale / route only — never any rendered user text', () => {
    recordGap({ key: 'listing.contactSeller', requested: 'zu', servedBy: 'en', route: '/item/xyz' });
    const g = getGapReport()[0]!;
    expect(g).toEqual({ key: 'listing.contactSeller', requested: 'zu', servedBy: 'en', route: '/item/xyz', at: g.at });
    // No field is the English message or any interpolation value.
    expect(JSON.stringify(g)).not.toContain('Contact seller');
  });

  it('deduplicates the same key/locale/route so a 40-row list is one report line', () => {
    for (let i = 0; i < 40; i++) recordGap({ key: 'nav.search', requested: 'zu', servedBy: 'en', route: '/search' });
    expect(getGapReport().length).toBe(1);
  });

  it('does not throw when a listener throws, and still keeps the report', () => {
    onGap(() => {
      throw new Error('listener exploded');
    });
    expect(() => recordGap({ key: 'search.noResults', requested: 'xh', servedBy: 'en', route: '/search' })).not.toThrow();
    expect(getGapReport().length).toBe(1);
  });

  it('does not throw on absent route (null) and returns a copy, not the live array', () => {
    recordGap({ key: 'common.loading', requested: 'zu', servedBy: 'en' });
    const a = getGapReport();
    const b = getGapReport();
    expect(a[0]!.route).toBe(null);
    expect(a).not.toBe(b);
    resetGaps();
    expect(getGapReport().length).toBe(0);
  });
});
