/**
 * RTL — declared unsupported, asserted not-yet-wrong.
 *
 * Every launch language (English, isiZulu, isiXhosa, Afrikaans) is written left-to-right, so the app
 * has no bidirectional layout path. This file does NOT fake one. It states the direction table that is
 * true today and provides `assertNoRtlShipped()`, which the provider calls on mount: if someone later
 * adds an RTL locale (Arabic, Hebrew, Urdu) to `SUPPORTED_LOCALES` without also implementing dir-aware
 * layout, this throws at startup instead of silently rendering mirrored-into-LTR text. That is the
 * "not yet wrong" part — the unsupported claim stays honest and machine-checked, not a comment that
 * quietly rots.
 *
 * Note one genuine bidi subtlety even in LTR text: an LTR UI can display an embedded RTL string (a
 * buyer typing Arabic into a message). That is handled by `unicode-bidi: plaintext` at the DOM
 * boundary, which lives in the app shell (a different agent's directory), not here. This module is
 * about layout direction of the interface, which is what we assert on.
 */

import { SUPPORTED_LOCALES, type Locale } from './locale.js';

export type Direction = 'ltr' | 'rtl';

/**
 * The authoritative direction per locale. Listing every supported locale explicitly (rather than a
 * blanket default) means adding a locale without declaring its direction is a compile-time gap.
 */
export const TEXT_DIRECTION: Readonly<Record<Locale, Direction>> = {
  en: 'ltr',
  zu: 'ltr',
  xh: 'ltr',
  af: 'ltr',
};

export function textDirection(locale: Locale): Direction {
  return TEXT_DIRECTION[locale] ?? 'ltr';
}

export function isRtl(locale: Locale): boolean {
  return textDirection(locale) === 'rtl';
}

/**
 * True when this build ships no RTL locale. The provider refuses to mount RTL work it has not done,
 * so a mis-declared locale surfaces here as a thrown, loud error rather than a broken layout.
 */
export function hasRtlLocale(): boolean {
  return SUPPORTED_LOCALES.some((locale) => isRtl(locale));
}

/** Startup guard. Throws with an actionable message if an RTL locale has been added without support. */
export function assertNoRtlShipped(): void {
  const offenders = SUPPORTED_LOCALES.filter((locale) => isRtl(locale));
  if (offenders.length > 0) {
    throw new Error(
      `@nastech/i18n: RTL locale(s) ${offenders.join(', ')} are declared but bidirectional layout is not implemented. ` +
        'Do not add an RTL locale until the app shell ships dir-aware layout.',
    );
  }
}
