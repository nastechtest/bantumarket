/**
 * Catalogue shapes.
 *
 * The load-bearing contract lives in `catalogue-completeness.test.ts`, and these types exist so that
 * test can be a *set* comparison rather than a deep, silent walk:
 *
 *   - `en` is the complete `Catalogue`: every `MessageKey` has a value.
 *   - a translation is a `LocaleMessages` = the strings it actually has, PLUS an explicit
 *     `untranslated` allowlist naming every `MessageKey` it does NOT have, each with a reason.
 *
 * A key must be in exactly one of those two lists. That is the whole point: a missing translation is
 * a declared gap in the data, never an implicit fall-through to English pretending to be isiZulu.
 * If a key is translated, it must come out of the allowlist, or the test fails — so the allowlist
 * cannot quietly rot into a place to hide work that was actually done.
 */

import type { Locale } from '../locale.js';
import type { MessageKey } from './en.js';

/** The complete English source. Every `MessageKey` present. */
export type Catalogue = Readonly<Record<MessageKey, string>>;

/** A translation-in-progress: only the keys it genuinely has, typed against the English key space. */
export type PartialCatalogue = Readonly<Partial<Record<MessageKey, string>>>;

/**
 * One declared gap. `reason` is required and is a sentence, not a shrug — "needs a native review of
 * the noun-class agreement in the plural" is a reason; "todo" is not. The reviewer reads these.
 */
export interface UntranslatedEntry {
  readonly key: MessageKey;
  readonly reason: string;
}

export interface LocaleMessages {
  readonly locale: Locale;
  readonly messages: PartialCatalogue;
  readonly untranslated: readonly UntranslatedEntry[];
}

/** All catalogue-shaped objects keyed by locale, for the completeness test to iterate. */
export type CatalogueRegistry = Readonly<Record<Locale, LocaleMessages>>;
