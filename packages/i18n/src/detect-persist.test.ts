/**
 * Locale detection and persistence — the seams a language switcher lives on. Pure and injected (no
 * reliance on a real `window`/`localStorage`), so it runs on the Node test host and off the main thread
 * exactly as it does in a browser.
 */

import { describe, it, expect } from 'bun:test';
import { normalizeLocale } from './locale.js';
import { pickLocale, parseAcceptLanguage, detectLocale } from './detect.js';
import { createMemoryStorage, loadLocale, saveLocale, clearLocale, LOCALE_STORAGE_KEY } from './persist.js';

describe('normalizeLocale', () => {
  it('maps region tags to the base language, case- and separator-insensitively', () => {
    expect(normalizeLocale('en-ZA')).toBe('en');
    expect(normalizeLocale('zu')).toBe('zu');
    expect(normalizeLocale('XH_zA-1996')).toBe('xh');
    expect(normalizeLocale('  af  ')).toBe('af');
  });
  it('returns null for a language we have no catalogue for', () => {
    expect(normalizeLocale('fr')).toBe(null);
    expect(normalizeLocale('')).toBe(null);
    expect(normalizeLocale(null)).toBe(null);
    expect(normalizeLocale(undefined)).toBe(null);
  });
});

describe('pickLocale / parseAcceptLanguage', () => {
  it('picks the first supported tag in order', () => {
    expect(pickLocale(['fr', 'zu', 'en'])).toBe('zu');
  });
  it('defaults to English when nothing is supported', () => {
    expect(pickLocale(['fr', 'de'])).toBe('en');
    expect(pickLocale([])).toBe('en');
  });
  it('orders Accept-Language by q-value', () => {
    expect(parseAcceptLanguage('en,zu;q=0.8,af;q=0.5')).toEqual(['en', 'zu', 'af']);
    expect(parseAcceptLanguage('af;q=0.3, zu;q=0.9')).toEqual(['zu', 'af']);
    expect(parseAcceptLanguage(null)).toEqual([]);
  });
  it('detectLocale honours the saved choice over the environment', () => {
    expect(detectLocale('af')).toBe('af');
    // No navigator on the Node host, so a null saved choice falls to the English default.
    expect(detectLocale(null)).toBe('en');
  });
});

describe('persist', () => {
  it('round-trips through an injected store', () => {
    const mem = createMemoryStorage();
    expect(loadLocale(mem)).toBe(null);
    expect(saveLocale('zu', mem)).toBe(true);
    expect(loadLocale(mem)).toBe('zu');
    clearLocale(mem);
    expect(loadLocale(mem)).toBe(null);
  });
  it('normalises a stale or bad stored tag on read', () => {
    const mem = createMemoryStorage({ [LOCALE_STORAGE_KEY]: 'en-GB' });
    expect(loadLocale(mem)).toBe('en');
    const junk = createMemoryStorage({ [LOCALE_STORAGE_KEY]: 'klingon' });
    expect(loadLocale(junk)).toBe(null);
  });
  it('is a no-op without throwing when storage is unavailable', () => {
    expect(loadLocale(null)).toBe(null);
    expect(saveLocale('af', null)).toBe(false);
  });
  it('survives a store whose setItem throws (Safari private mode)', () => {
    const hostile = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
      removeItem: () => {},
    };
    expect(saveLocale('zu', hostile)).toBe(false);
  });
});
