/**
 * @nastech/i18n — South African localisation for NasTech Market.
 *
 * Public surface, deliberately small and honest: the React provider + hook, the locale identity, the
 * four formatters that every screen touches (money, date, number, phone, units), the CLDR `Plural`
 * resolver, and the catalogue types. Everything else (`icu`, `fallback-chain`, `detect`, `persist`,
 * `missing`, `rtl`, `translate`) is exported here only where a consumer in this wave actually needs it;
 * the internal helpers stay reachable by subpath (`@nastech/i18n/missing`) rather than widening the
 * barrel, so fourteen feature agents do not couple to an unstable surface.
 *
 * The single design rule across all of it: a missing translation is a visible, recorded gap, never
 * English silently rendered under another language's label.
 */

// --- Locale identity ---
export type { Locale } from './locale.js';
export {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  LOCALE_REGION_TAGS,
  isSupportedLocale,
  normalizeLocale,
} from './locale.js';

// --- Provider + hook ---
export { Provider } from './provider.js';
export type { I18nProviderProps, I18nState } from './provider.js';
export { useTranslation } from './use-translation.js';

// --- Plural (CLDR categories, not "1 or many") ---
export { Plural } from './plural.js';
export type { PluralCategory } from './plural.js';

// --- Formatters ---
export { formatCurrency } from './formatter/currency.js';
export type { CurrencyValue, FormatCurrencyOptions } from './formatter/currency.js';

export {
  formatDate,
  formatDateTime,
  formatWeekday,
  formatLegalTimestamp,
  SAST_OFFSET_MINUTES,
} from './formatter/date.js';
export type { TemporalInput } from './formatter/date.js';

export { formatNumber } from './formatter/number.js';
export type { FormatNumberOptions } from './formatter/number.js';

export { formatPhone, formatPhoneNational, parsePhone, toE164 } from './formatter/phone.js';
export type { PhoneResult, PhoneError } from './formatter/phone.js';

export { formatUnit, formatCaseSize } from './formatter/units.js';
export type { UnitSymbol } from './formatter/units.js';

// --- Catalogue types (the shape the completeness test enforces) ---
export type { Catalogue, CatalogueRegistry, LocaleMessages, PartialCatalogue, UntranslatedEntry } from './catalogue/types.js';
export type { MessageKey } from './catalogue/en.js';

// --- Resolution + direction + gap reporting (used by the app shell / router / a QA overlay) ---
export { translate, resolvePattern, hasOwnTranslation, CATALOGUES } from './translate.js';
export type { TranslateOptions, TranslateValues } from './translate.js';
export { textDirection, isRtl } from './rtl.js';
export type { Direction } from './rtl.js';
export { onGap, getGapReport, recordGap, resetGaps } from './missing.js';
export type { GapRecord, GapListener } from './missing.js';
