/**
 * A lawful-basis note per consent category — the disclosure POPIA s18(1) expects to exist *before*
 * processing, not reconstructed afterwards.
 *
 * Why this is a module and not a string in the banner: the text has to be the same one the analytics
 * payloads reference (`noticeVersion` on every envelope), the access-request export has to print it,
 * and the person answering a Regulator's query needs to find it in one place. Copy is data here.
 *
 * The section numbers are load-bearing and were checked against Act 4 of 2013 as commonly cited:
 *  · s11(1)(a) consent · s11(1)(b) law · s11(1)(c) contract/necessary for a request · s11(1)(d) legitimate interests
 *  · s11(3) what consent means (voluntary, specific, informed) · s11(4) read with s5 — withdrawal
 *  · s14 purpose limitation · s15(4) further use must not be incompatible · s18 openness/documentation
 *  · s22 access · s23 correction or deletion · s46 special personal information (none collected here)
 *
 * CONTRACT-GAP: user-facing copy lives in `@nastech/i18n` at integration (brief 19, written
 * concurrently — importing it here would make this module unbuildable today). The keys are declared
 * below so the translation pass has a list to work from, and the English text is the fallback.
 */
import type { ConsentCategory } from '../../../lib/consent/types.js';
import { EVENT_NAMES, EVENTS } from '../events.js';

export interface LawfulBasisNote {
  readonly category: ConsentCategory;
  /** What actually happens to the data, in the buyer's language rather than the engineer's. */
  readonly processing: string;
  /** The question we are trying to answer by collecting it. If this is vague, the event should go. */
  readonly purpose: string;
  /** POPIA s11(1) ground, cited. */
  readonly basis: string;
  readonly basisShort: string;
  readonly consentRequired: boolean;
  /** Whether the buyer can switch it off, which is not the same question as whether we asked. */
  readonly canRefuse: boolean;
  readonly canWithdraw: boolean;
  /** Retention for rows in this category, stated because s14(1) requires the purpose to have an end. */
  readonly retention: string;
  readonly sharedWith: string;
  /** i18n keys the controller needs to provide; the English strings above are the fallback copy. */
  readonly copyKeys: readonly string[];
  /** The events in this category, derived from the catalogue so this line can never go stale. */
  readonly events: readonly string[];
}

export const LAWFUL_BASIS: Readonly<Record<ConsentCategory, LawfulBasisNote>> = {
  essential: {
    category: 'essential',
    processing:
      'We keep a record of the choices you made about your privacy, and we use a random, changing reference so that the actions in one visit can be counted without a permanent identifier being stored about you.',
    purpose:
      'To be able to show which permission was in force for any piece of data we hold, and to give you an identifier-free way to change your mind. This is also what lets us measure how many buyers ever see the consent question — without it, every number below is uninterpretable.',
    basis: 'POPIA s11(1)(b) (required by law — s18(1) documentation of processing, and the ability to demonstrate s11(3) consent) read with s11(1)(d) legitimate interests in being able to prove it.',
    basisShort: 'legal obligation + legitimate interests',
    consentRequired: false,
    canRefuse: false,
    canWithdraw: false,
    retention: 'The consent record itself: 3 years (the Prescription Act period a complaint could arrive under), then deleted. The rotating reference is never stored by us beyond 30 days and is regenerated whenever your choices change.',
    sharedWith: 'Nobody. It stays with NasTech Market.',
    copyKeys: ['analytics.consent.essential.processing', 'analytics.consent.essential.purpose'],
    events: eventsFor('essential'),
  },
  quality: {
    category: 'quality',
    processing:
      'If you agree, we measure how fast pages become usable and how often the 3D view could not be shown — for example because this device has no WebGL, or because the scene would have cost more data than your connection allowed.',
    purpose:
      'To know whether the app works on the phones our buyers actually have, and to know how often the 3D inspection is unavailable. That second number decides whether the studio capture programme is worth what it costs, and the static path is what most people will see either way.',
    basis: 'POPIA s11(1)(a) consent, given voluntarily, for this specific purpose, after this disclosure (s11(3)).',
    basisShort: 'consent (s11(3))',
    consentRequired: true,
    canRefuse: true,
    canWithdraw: true,
    retention: 'Individual measurements: 30 days. After that only counts by day, route and device capability class remain, which cannot be traced back to a visit.',
    sharedWith: 'Nobody outside NasTech Market. No third-party analytics endpoint receives these rows.',
    copyKeys: ['analytics.consent.quality.processing', 'analytics.consent.quality.purpose'],
    events: eventsFor('quality'),
  },
  measurement: {
    category: 'measurement',
    processing:
      'If you agree, we count the steps a buyer takes — searched, looked at an item, opened the inspection, started checkout, paid — and the steps a seller takes to get a listing live. Each step is a label and a range, never a word you typed or an amount you paid.',
    purpose:
      'To answer three specific questions with numbers: how long a new seller takes to get a first listing live, what share of listings ever reach "live", and what share of buyers who inspect an item go on to buy it.',
    basis: 'POPIA s11(1)(a) consent, given voluntarily, for this specific purpose, after this disclosure (s11(3)).',
    basisShort: 'consent (s11(3))',
    consentRequired: true,
    canRefuse: true,
    canWithdraw: true,
    retention: 'Step rows: 90 days. After that only funnel counts per day survive. Nothing in this category is used to decide anything about an individual person — no ranking, no pricing, no risk decision — which is why it is measured in buckets.',
    sharedWith: 'Nobody outside NasTech Market.',
    copyKeys: ['analytics.consent.measurement.processing', 'analytics.consent.measurement.purpose'],
    events: eventsFor('measurement'),
  },
  marketing: {
    category: 'marketing',
    processing: 'Nothing. We do not collect data for advertising, and there is no field in which to collect it.',
    purpose:
      'Declared so that the absence is a position and not an oversight: if a future change wants to profile buyers for advertising, it has to change this registry, delete a test that asserts this category is empty, and answer for it under s13 (direct marketing requires opt-in on its own).',
    basis: 'Not processed. s13 would require an explicit opt-in, and the pilot has no lawful interest in becoming a advertising audience business.',
    basisShort: 'not processed',
    consentRequired: false,
    canRefuse: false,
    canWithdraw: false,
    retention: 'No rows exist, so nothing is retained. Refusals in this category are recorded as decisions, not as behavioural data.',
    sharedWith: 'Nobody. There is no data to share.',
    copyKeys: ['analytics.consent.marketing.processing'],
    events: eventsFor('marketing'),
  },
};

function eventsFor(category: ConsentCategory): readonly string[] {
  return EVENT_NAMES.filter((name) => EVENTS[name].category === category);
}

/**
 * The three checks a reviewer should be able to run without reading prose: no marketing events, the
 * gated categories all have a consent basis, and every category in the catalogue has a note.
 */
export function assertBasisCoherent(): string[] {
  const problems: string[] = [];
  if (LAWFUL_BASIS.marketing.events.length > 0) {
    problems.push(`marketing category has ${LAWFUL_BASIS.marketing.events.length} event(s) declared: ${LAWFUL_BASIS.marketing.events.join(', ')}`);
  }
  for (const category of ['quality', 'measurement'] as const) {
    if (!LAWFUL_BASIS[category].consentRequired) problems.push(`${category} must be consent-gated`);
  }
  for (const name of EVENT_NAMES) {
    const note = LAWFUL_BASIS[EVENTS[name].category];
    if (note === undefined) problems.push(`${name} has no lawful-basis note`);
    if (EVENTS[name].purpose.trim().length < 40) problems.push(`${name} has no stated purpose`);
  }
  return problems;
}

/** One-line answer to "why are you allowed to send this?", for the preferences screen and the gateway log. */
export function basisSummary(category: ConsentCategory): string {
  return `${category}: ${LAWFUL_BASIS[category].basisShort}`;
}
