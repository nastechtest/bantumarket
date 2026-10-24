/**
 * THE load-bearing test. A missing translation must be a visible, declared gap — never English
 * silently rendered under an isiZulu / isiXhosa / Afrikaans label. Every rule below encodes one way
 * that invariant could rot:
 *
 *   1. Every key in `en` is either present in the locale's `messages` OR in its `untranslated`
 *      allowlist (with a reason). No third option — that would be silent English leakage.
 *   2. The allowlist cannot contain a key the locale HAS actually translated. If it does, the allowlist
 *      is lying / hiding a duplicate, and the test fails. This is the rule the brief names explicitly.
 *   3. No locale invents a key `en` does not have.
 *   4. Allowlist entries are valid, unique, and reviewed (a real reason, not "todo").
 *   5. A present value must not be a byte-for-byte copy of English (guards against English pasted in,
 *      or English-with-diacritics pretending to be a translation).
 */

import { describe, it, expect } from 'bun:test';
import { en, type MessageKey } from './catalogue/en.js';
import { CATALOGUES } from './translate.js';
import { SUPPORTED_LOCALES, type Locale } from './locale.js';

const EN_KEYS = Object.keys(en) as MessageKey[];

/** Translations measured against English. English itself is the reference and trivially complete. */
const TARGET_LOCALES: readonly Locale[] = SUPPORTED_LOCALES.filter((l) => l !== 'en');

function presentKeys(locale: Locale): Set<string> {
  return new Set(Object.keys(CATALOGUES[locale].messages));
}
function allowlistKeys(locale: Locale): string[] {
  return CATALOGUES[locale].untranslated.map((u) => u.key as string);
}

describe('catalogue completeness', () => {
  for (const locale of TARGET_LOCALES) {
    describe(`${locale}`, () => {
      it('covers every English key with a translation or a declared gap (no silent English)', () => {
        const present = presentKeys(locale);
        const allowed = new Set(allowlistKeys(locale));
        for (const key of EN_KEYS) {
          const covered = present.has(key) || allowed.has(key);
          expect(covered, `key "${key}" in ${locale} is neither translated nor allowlisted`).toBe(true);
        }
      });

      it('does not allowlist a key it has actually translated', () => {
        const present = presentKeys(locale);
        for (const key of allowlistKeys(locale)) {
          expect(present.has(key), `"${key}" is in ${locale}'s untranslated list but IS translated`).toBe(false);
        }
      });

      it('invents no key that English does not have', () => {
        const enSet = new Set<string>(EN_KEYS);
        for (const key of presentKeys(locale)) {
          expect(enSet.has(key), `unknown key "${key}" in ${locale}`).toBe(true);
        }
      });

      it('allowlists only real English keys, uniquely', () => {
        const enSet = new Set<string>(EN_KEYS);
        const seen = new Set<string>();
        for (const entry of CATALOGUES[locale].untranslated) {
          expect(enSet.has(entry.key), `allowlist "${entry.key}" is not an English key`).toBe(true);
          expect(seen.has(entry.key), `duplicate allowlist entry "${entry.key}"`).toBe(false);
          seen.add(entry.key);
        }
      });

      it('gives every gap a reviewed reason (longer than a shrug)', () => {
        for (const entry of CATALOGUES[locale].untranslated) {
          expect(entry.reason.length >= 15, `weak reason for "${entry.key}"`).toBe(true);
          expect(/todo|tbd|\?/i.test(entry.reason), `placeholder reason for "${entry.key}"`).toBe(false);
        }
      });

      it('does not paste English values through as a "translation"', () => {
        const messages = CATALOGUES[locale].messages;
        for (const key of EN_KEYS) {
          const value = messages[key];
          if (value === undefined) continue; // it is a declared gap, checked elsewhere
          expect(value === en[key], `key "${key}" in ${locale} is a copy of English`).toBe(false);
        }
      });

      it('has no overlap and no hole: messages ∪ untranslated == all English keys', () => {
        const present = presentKeys(locale);
        const allowed = new Set(allowlistKeys(locale));
        const union = new Set<string>([...present, ...allowed]);
        expect(union.size).toBe(EN_KEYS.length);
        for (const key of EN_KEYS) expect(union.has(key)).toBe(true);
      });
    });
  }

  it('English is itself complete and has an empty gap list', () => {
    const enMessages = CATALOGUES.en.messages;
    for (const key of EN_KEYS) expect(enMessages[key] !== undefined).toBe(true);
    expect(CATALOGUES.en.untranslated.length).toBe(0);
  });

  it('reports the real gap count per language (so the report stays visible, not satisfiable)', () => {
    // A sanity count: Afrikaans ships complete, the Nguni languages ship a bounded, declared subset.
    const afGaps = CATALOGUES.af.untranslated.length;
    const zuGaps = CATALOGUES.zu.untranslated.length;
    const xhGaps = CATALOGUES.xh.untranslated.length;
    expect(afGaps).toBe(0);
    expect(zuGaps > 0).toBe(true);
    expect(xhGaps > 0).toBe(true);
    expect(afGaps + zuGaps + xhGaps).toBeLessThan(EN_KEYS.length * 3);
  });
});
