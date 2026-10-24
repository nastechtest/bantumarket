/**
 * Locale identity for the South African launch.
 *
 * Launch is South Africa, one city. We ship catalogues for four languages: English is the working
 * language of the listing; isiZulu, isiXhosa and Afrikaans are real requirements, not a checkbox.
 * `Locale` is the *base* tag we resolve messages for — region suffixes (`en-ZA`, `zu-ZA`) are
 * normalised onto it by `normalizeLocale`, because the message key space is per-language, not
 * per-region, and a per-region key space would let a gap hide behind an unregistered `en-ZA`.
 */

export const SUPPORTED_LOCALES = ['en', 'zu', 'xh', 'af'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * English is the terminal fallback: it is the language the listing is authored in, so a message that
 * exists in English always exists somewhere. This is a deliberate choice, not a default — see
 * `fallback-chain.ts` for why isiZulu does NOT fall back to Afrikaans.
 */
export const DEFAULT_LOCALE: Locale = 'en';

/** Endonym / human label, shown in the language picker next to its own translation. */
export const LOCALE_LABELS: Readonly<Record<Locale, string>> = {
  en: 'English',
  zu: 'isiZulu',
  xh: 'isiXhosa',
  af: 'Afrikaans',
};

/** BCP-47 region tag we present each language under. The pilot is a single country. */
export const LOCALE_REGION_TAGS: Readonly<Record<Locale, string>> = {
  en: 'en-ZA',
  zu: 'zu-ZA',
  xh: 'xh-ZA',
  af: 'af-ZA',
};

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Map any BCP-47-ish tag onto a supported `Locale`, or null if we have no catalogue for it.
 * Handles `zu`, `zu-ZA`, `zu-ZA-1996`, and case/underscore variants. We match on the primary
 * subtag only: a request for `xh-ZA` and `xh` are the same message space to us.
 */
export function normalizeLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const primary = tag.trim().toLowerCase().replace(/_/g, '-').split('-')[0];
  if (!primary) return null;
  return isSupportedLocale(primary) ? primary : null;
}
