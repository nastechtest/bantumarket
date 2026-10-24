/**
 * Message resolution: catalogue registry + fallback chain + gap reporting + ICU, in one pure function.
 *
 * This is the whole lookup path, deliberately outside React so it is testable without a renderer and
 * usable from a server render. `translate(key, locale, values)` walks the fallback chain
 * (`fallback-chain.ts`) — which is only ever `<locale> → en` — and renders the found pattern with the
 * ICU subset (`icu.ts`). If the pattern came from a different language than requested (i.e. English
 * served an isiZulu request), that is recorded as a gap by `missing.ts`; the caller still gets a real
 * string, never an empty one, because a blank checkout label is worse than an honest English fallback
 * that we have logged as work to do.
 *
 * Rendering of numbers/plurals inside a served string uses the *serving* locale, not the requested
 * one: an English fallback line is an English sentence, so `{count}` groups like English. Formatting a
 * served-English number with Afrikaans separators would mix two conventions in one visible string.
 */

import type { Locale } from './locale.js';
import type { MessageKey } from './catalogue/en.js';
import type { LocaleMessages } from './catalogue/types.js';
import { enMessages } from './catalogue/en.js';
import { af } from './catalogue/af.js';
import { zu } from './catalogue/zu.js';
import { xh } from './catalogue/xh.js';
import { fallbackChain, crossedLanguage } from './fallback-chain.js';
import { formatIcu, type IcuValues } from './icu.js';
import { recordGap } from './missing.js';

export const CATALOGUES: Readonly<Record<Locale, LocaleMessages>> = {
  en: enMessages,
  af,
  zu,
  xh,
};

export type TranslateValues = IcuValues;

export interface ResolvedPattern {
  readonly pattern: string;
  /** The locale whose catalogue actually held the string. */
  readonly servedBy: Locale;
}

/**
 * Find the raw pattern for `key`, following the fallback chain. `null` means the key is in no
 * catalogue we ship — a defect in the key space (a `t()` call for a key not in `en`), not a normal
 * translation gap.
 */
export function resolvePattern(key: MessageKey, locale: Locale): ResolvedPattern | null {
  for (const candidate of fallbackChain(locale)) {
    const pattern = CATALOGUES[candidate].messages[key];
    if (pattern !== undefined) return { pattern, servedBy: candidate };
  }
  return null;
}

export interface TranslateOptions {
  readonly locale: Locale;
  /** Route path for gap attribution; the provider passes the current one. Not required. */
  readonly route?: string | null;
  readonly values?: TranslateValues;
}

/**
 * Resolve and render `key` for `opts.locale`. Returns a non-empty string for any real `MessageKey`
 * (English is the terminal fallback and is complete). A key absent from every catalogue renders the
 * key itself — visible as a bug — rather than an empty string or a silent English substitution.
 */
export function translate(key: MessageKey, opts: TranslateOptions): string {
  const found = resolvePattern(key, opts.locale);
  if (found === null) {
    recordGap({ key, requested: opts.locale, servedBy: opts.locale, route: opts.route ?? null });
    return key;
  }
  if (crossedLanguage(opts.locale, found.servedBy)) {
    recordGap({ key, requested: opts.locale, servedBy: found.servedBy, route: opts.route ?? null });
  }
  return formatIcu(found.pattern, opts.values ?? {}, { locale: found.servedBy });
}

/**
 * True when `locale` has its own translation for `key` (no fallback needed). Drives the "is this a
 * real gap here?" question in tests and in a debug overlay, distinct from whether `translate` can
 * render a string at all.
 */
export function hasOwnTranslation(locale: Locale, key: MessageKey): boolean {
  return CATALOGUES[locale].messages[key] !== undefined;
}
