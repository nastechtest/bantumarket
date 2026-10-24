# @nastech/i18n — South African localisation

Locale, translation and formatting for NasTech Market. Launch is South Africa, one city. The honest
position this package encodes: **English is the working language of the listing**, and isiZulu,
isiXhosa and Afrikaans are real requirements, not a checkbox. A missing translation is a *visible,
declared gap in the data* — never English silently rendered under another language's label.

## Public surface

From `@nastech/i18n`:

```ts
import {
  Locale, Provider, useTranslation, Plural,
  formatCurrency, formatDate, formatPhone, formatNumber, formatUnit,
} from '@nastech/i18n';
```

- `Locale` — `'en' | 'zu' | 'xh' | 'af'` (base tags; `normalizeLocale` folds `en-ZA` etc. onto them).
- `Provider` / `useTranslation()` — React context owning the active locale, `dir`, `route` and `t()`.
- `Plural` — CLDR cardinal plural categories (see below), **not** a "1 or many" shortcut.
- `formatCurrency` — ZAR from the branded `Cents` / `Money`, never a float.
- `formatDate` / `formatDateTime` / `formatLegalTimestamp` — SAST (UTC+2, no DST), never the client tz.
- `formatPhone` / `parsePhone` / `toE164` — South African numbers normalised to E.164.
- `formatNumber` / `formatUnit` — locale grouping; SI measurement formatting.

Deep modules (`icu`, `fallback-chain`, `detect`, `persist`, `missing`, `rtl`, `translate`) are reachable
by subpath and are re-exported only where a consumer needs them, so fourteen feature agents do not
couple to an unstable surface.

## Money (ZAR)

`formatCurrency(value, locale)` reads the way South Africans read a price, and it consumes `Cents`
from `@nastech/api-contracts`, so a fractional cent is a runtime `TypeError`, not a silent rounding:

| locale          | amount        | rendered       |
| --------------- | ------------- | -------------- |
| `en` (en-ZA)    | 125000 cents  | `R1,250.00`    |
| `af` (and zu/xh)| 125000 cents  | `R1 250,00`    |

Space thousands grouping + comma decimal for Afrikaans/isiZulu/isiXhosa; comma grouping + dot decimal
for English ZA. This is done by hand, not `Intl` — Node 18 ICU builds vary and `Intl`'s `en-ZA` emits
the *other* form. Negatives lead with a minus (`-R1 250,00`), matching `design-system`; a statement can
request the accounting form (`(R1 250,00)`).

## Plurals

Real CLDR operand rules, from `common/supplemental/plurals.xml`:

| locale     | cardinal `one` condition | else    |
| ---------- | ------------------------ | ------- |
| `en`       | `i = 1 and v = 0`        | `other` |
| `af`       | `n = 1`                  | `other` |
| `xh`       | `n = 1`                  | `other` |
| `zu`       | `i = 0 or n = 1`         | `other` |

These genuinely disagree: `1.0` is `other` in English but `one` in Afrikaans/isiXhosa; `0` and `0.5` are
`one` in isiZulu but `other` in English. `icu.ts` picks the branch using the *serving* locale's rule.

## Fallback and gaps

The fallback chain for every non-English locale goes straight to English and stops there. isiZulu is
**never** served Afrikaans — "both South African" is not mutual intelligibility. When a request falls
through to English, `missing.ts` records `{ key, requested, servedBy, route }` — the key id and route
only, never the rendered user text — and the report survives after launch so the real gaps can be
prioritised. Reporting never throws, so a content bug can never blank a checkout page.

## Dates

South African Standard Time is a fixed UTC+2 (no DST since 2006). Every timestamp is reduced to a UTC
instant, shifted by +2h, and read with UTC getters — so it is identical on a Cape Town server, a UTC
runner, and a browser in Berlin. `formatLegalTimestamp` emits an explicit `+02:00` ISO string for the
records the dispute process reads. English/Afrikaans month names and the Nguni weekday names are
shipped; **isiZulu/isiXhosa month names are not asserted** and those locales render a numeric date
rather than a guessed translation.

## Phone

`parsePhone` accepts `+27…`, `08…`, `0 8…` (spaces/hyphens/parens tolerated) and normalises to E.164.
It rejects anything that is not a South African subscriber number — notably a UK number that happens to
be ten digits (`2071838301`, no trunk zero) and any `+44…` — because silently coercing a foreign number
into a ZA one loses the buyer's actual contact detail.

## RTL

Declared unsupported and asserted not-yet-wrong. Every launch locale is LTR; the provider runs
`assertNoRtlShipped()` on mount, which throws if an RTL locale is ever added to `SUPPORTED_LOCALES`
without bidirectional layout being implemented. Embedded RTL inside an LTR string (a buyer typing
Arabic into a message) is a `unicode-bidi: plaintext` concern at the DOM boundary in the app shell, not
here.

## Translation coverage (as of this wave)

This is the honest state, and `catalogue-completeness.test.ts` keeps it honest — every English key is
either translated or in an explicit, reviewed `untranslated` allowlist per locale, and the test *fails*
if the allowlist contains a key that was actually translated, or if a "translation" is a byte-copy of
English.

| locale      | translated | declared gaps | notes                                                            |
| ----------- | ---------- | ------------- | ---------------------------------------------------------------- |
| `en`        | complete   | 0             | authoring source.                                                |
| `af`        | complete   | 0             | full, defensible Afrikaans.                                      |
| `zu` (isiZulu)   | 7    | 19            | only single-word nouns/greetings I can defend; all plural/concord strings withheld. |
| `xh` (isiXhosa)  | 7    | 19            | same discipline; `Ixabiso`/`Enkosi`/`Hayi`/`Ewe` are Xhosa forms. |

The 19 gaps in isiZulu and isiXhosa are noun phrases, verb phrases and every plural message whose
correct form depends on Nguni noun-class agreement. Shipping an English-under-a-Zulu-label string, or a
machine-garbled guess, is worse than the declared gap — so those keys are recorded as missing and render
the English fallback while being logged. Each gap carries a reason in the catalogue file for review.

## Verification

```
bun test packages/i18n
./node_modules/.bin/tsc -p tsconfig.json --noEmit
bun scripts/check-3d-boundaries.ts --self-test
```
