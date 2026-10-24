/**
 * Fallback chain. The rules that matter: English is the only terminal fallback (isiZulu never serves
 * Afrikaans), an unknown tag degrades to English rather than throwing, and — the point of the whole
 * package — a gap renders a real string AND records which locale asked, which locale served, on which
 * route. That record is the "visible gap in the data" the brief requires.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { fallbackChain, crossedLanguage } from './fallback-chain.js';
import { translate, hasOwnTranslation } from './translate.js';
import { getGapReport, resetGaps } from './missing.js';

describe('fallbackChain', () => {
  it('always ends at English, and only at English', () => {
    expect(fallbackChain('en')).toEqual(['en']);
    expect(fallbackChain('zu')).toEqual(['zu', 'en']);
    expect(fallbackChain('xh')).toEqual(['xh', 'en']);
    expect(fallbackChain('af')).toEqual(['af', 'en']);
  });

  it('never routes one non-English language to another (isiZulu does not serve Afrikaans)', () => {
    for (const start of ['zu', 'xh', 'af'] as const) {
      const chain = fallbackChain(start);
      const others = chain.filter((l) => l !== start && l !== 'en');
      expect(others.length).toBe(0);
    }
  });

  it('degrades an unknown or missing tag to the English chain without throwing', () => {
    expect(fallbackChain('fr')).toEqual(['en']);
    expect(fallbackChain(null)).toEqual(['en']);
    expect(fallbackChain(undefined)).toEqual(['en']);
    expect(fallbackChain('en-ZA')).toEqual(['en']); // region suffix normalises to the base
  });

  it('crossedLanguage flags only a genuine language boundary', () => {
    expect(crossedLanguage('zu', 'zu')).toBe(false);
    expect(crossedLanguage('zu', 'en')).toBe(true);
  });
});

describe('translate — a gap is a recorded fallback, not silent English', () => {
  beforeEach(() => resetGaps());

  it('serves an own translation without recording a gap', () => {
    resetGaps();
    expect(translate('listing.buy', { locale: 'zu' })).toBe('Thenga');
    expect(getGapReport().length).toBe(0);
  });

  it('falls back to English for an allowlisted gap and records requested / served / route', () => {
    // nav.search is untranslated in isiZulu, so English serves it — and that must be logged.
    const out = translate('nav.search', { locale: 'zu', route: '/search' });
    expect(out).toBe('Search');
    const gaps = getGapReport();
    expect(gaps.length).toBe(1);
    const g = gaps[0]!;
    expect(g.key).toBe('nav.search');
    expect(g.requested).toBe('zu');
    expect(g.servedBy).toBe('en');
    expect(g.route).toBe('/search');
  });

  it('records nothing for a fully-translated Afrikaans catalogue', () => {
    translate('nav.categories', { locale: 'af' });
    translate('account.soldCount', { locale: 'af', values: { count: 3 } });
    expect(getGapReport().length).toBe(0);
  });

  it('hasOwnTranslation distinguishes a real gap from mere renderability', () => {
    expect(hasOwnTranslation('zu', 'listing.buy')).toBe(true);
    expect(hasOwnTranslation('zu', 'nav.search')).toBe(false);
    // Even though "nav.search" is not own to Zulu, translate() still returns a string (English).
    expect(translate('nav.search', { locale: 'zu' })).toBe('Search');
  });
});
