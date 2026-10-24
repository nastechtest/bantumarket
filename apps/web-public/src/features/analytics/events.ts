/**
 * The typed event catalogue — the whole measurement plan, written down before the tag is dropped.
 *
 * Three things this surface has to do, in order of importance:
 *
 *  1. **Answer 04's exit tests and the R270 question, or not exist.** Every event here is load-bearing
 *     for one of the four funnels in `funnels.ts` or for the consent record itself. An event that
 *     answers no question is a POPIA s14(1) collection with no purpose, and the collection limit says
 *     it goes.
 *  2. **Be typable and schema-checkable at the same time.** `EventPropsMap` gives the compiler the
 *     shape; `EVENTS` gives the runtime the same shape as data (`required`, `optional`, `forbidden`,
 *     per-prop specs). If the two ever disagree, `tsc` fails — `EVENTS` is annotated as a mapped type
 *     over `EventPropsMap`, so a new prop without a spec, or a `required` entry that is not a prop,
 *     does not compile. `events.test.ts` re-checks the same invariants at runtime for the callers who
 *     build events dynamically.
 *  3. **Be unrepresentable-PII, not politely PII-free.** Property types are enums, slugs, counts,
 *     milliseconds, bytes and correlation refs. There is no `string` prop in this catalogue that
 *     accepts a space, and no numeric prop whose unit is money (`no-pii.test.ts` asserts both). A
 *     listing title, a query, a phone number or an exact price cannot be expressed, so a feature
 *     cannot leak one by accident.
 *
 * Categories: see `lib/consent/types.ts`. `essential` has a lawful basis rather than a consent;
 * everything a buyer can switch off is `quality` or `measurement`.
 *
 * The catalogue is two modules — `event-vocabulary.ts` holds the closed value sets, `event-catalogue.ts`
 * holds the events and their props — and is re-exported whole from here, because callers treat it as
 * one contract: a feature imports an event name and the vocabulary its props use from the same place,
 * and `no-pii.test.ts` walks the two together.
 */
export * from './event-vocabulary.js';
export * from './event-catalogue.js';
