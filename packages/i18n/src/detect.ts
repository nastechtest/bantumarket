/**
 * Locale detection.
 *
 * The pure function `pickLocale(tags)` is what everything else uses: given an ordered list of BCP-47
 * tags (browser `navigator.languages`, a server `Accept-Language` header, a saved preference), return
 * the first one we have a catalogue for, else the default. It is pure and synchronous so it is trivial
 * to test and cannot be fooled by a missing `window`.
 *
 * The environment readers are thin, guarded wrappers: on a server or in a worker there is no
 * `navigator`, and that is not an error — it just yields no candidates. A launch is one SA city; the
 * default is English (the listing's working language), and a buyer who wants isiZulu picks it and it
 * persists (see `persist.ts`).
 */

import { DEFAULT_LOCALE, normalizeLocale, type Locale } from './locale.js';

/** First supported locale in `tags`, or `fallback`. Case- and region-insensitive via `normalizeLocale`. */
export function pickLocale(tags: readonly (string | null | undefined)[], fallback: Locale = DEFAULT_LOCALE): Locale {
  for (const tag of tags) {
    const locale = normalizeLocale(tag);
    if (locale) return locale;
  }
  return fallback;
}

/**
 * Parse an `Accept-Language` header into ordered tags (q-weight descending). We honour the client's
 * stated preference order but not q-values below the sort — a marketplace should follow what the
 * browser actually lists first, and q-parsing edge cases are not worth a dependency. Tolerates junk
 * (missing q, extra spaces, bare `*`).
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  const parts = header
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [tag, ...params] = p.split(';');
      let q = 1;
      for (const param of params) {
        const m = /^q=(\d*\.?\d+)$/i.exec(param.trim());
        if (m) q = Number(m[1]);
      }
      return { tag: tag ?? '', q };
    })
    .filter((entry) => entry.tag && entry.tag !== '*')
    .sort((a, b) => b.q - a.q);
  return parts.map((entry) => entry.tag);
}

/**
 * Browser `navigator.languages` (plus `navigator.language`) as candidate tags; empty array when there
 * is no DOM. Never throws off the main thread.
 */
export function browserTags(): string[] {
  try {
    const nav = (globalThis as { navigator?: { languages?: readonly string[]; language?: string } }).navigator;
    if (!nav) return [];
    const list = nav.languages && nav.languages.length > 0 ? [...nav.languages] : nav.language ? [nav.language] : [];
    return list;
  } catch {
    return [];
  }
}

/** Convenience for the provider: saved → browser → default, all resolved through `pickLocale`. */
export function detectLocale(saved: Locale | null, fallback: Locale = DEFAULT_LOCALE): Locale {
  return pickLocale([saved, ...browserTags()], fallback);
}
