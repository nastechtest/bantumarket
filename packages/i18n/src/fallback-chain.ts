/**
 * The locale fallback chain.
 *
 * English is the working language of the listing, so it is the terminal fallback for every locale.
 * Crucially, the other languages do NOT fall back to each other: an isiZulu request is never served
 * an Afrikaans string, because "both South African" is not mutual intelligibility and a marketplace
 * must not guess which of them a buyer reads. Every chain therefore ends, and only ends, at `en`.
 *
 * A hop that changes language is a real gap, not a dialect tweak — `crossedLanguage` marks exactly
 * those hops so `missing.ts` can record them and the UI can stop pretending the string is translated.
 */

import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from './locale.js';

/** Direct fallback per locale. All non-English locales go straight to English and stop there. */
const PARENT: Readonly<Record<Locale, Locale>> = {
  en: 'en',
  zu: 'en',
  xh: 'en',
  af: 'en',
};

/**
 * Ordered list of locales to try for a message. Starts at `locale`, walks the parent links to the
 * root, never repeats, always ends at English. Unknown input degrades to the default chain rather
 * than throwing — a bad tag from `detect.ts` must still render, honestly, in the working language.
 */
export function fallbackChain(locale: string | null | undefined): Locale[] {
  const start = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  const chain: Locale[] = [];
  const seen = new Set<Locale>();
  let current: Locale = start;
  while (!seen.has(current)) {
    seen.add(current);
    chain.push(current);
    const parent = PARENT[current];
    if (parent === current) break; // reached a root
    current = parent;
  }
  // Guarantee English is present even if the parent graph is ever edited to omit it.
  if (chain[chain.length - 1] !== DEFAULT_LOCALE) chain.push(DEFAULT_LOCALE);
  return chain;
}

/**
 * True when resolving `locale` down to `resolved` crossed a language boundary (not just region).
 * English is the only place a crossing is legitimate; any other locale appearing in a resolved chain
 * would mean we shipped one language's text under another's flag — which is exactly the failure the
 * brief forbids. This is the guard the fallback test asserts on.
 */
export function crossedLanguage(locale: Locale, resolved: Locale): boolean {
  return locale !== resolved;
}
