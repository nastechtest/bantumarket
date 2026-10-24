/**
 * The honesty core of this feature.
 *
 * A 3D render of a pre-owned watch is a very convincing picture of a thing that might not keep
 * time, might not hold 5 ATM, and might not be the brand it says it is. The capture programme knows
 * this — `claim_scope` in `@nastech/api-contracts` exists precisely because "a rotating watch looks
 * like 'serviced and genuine' and is neither" — and the dispute screen is where that boundary stops
 * being a listing footnote and becomes a decision somebody is going to be angry about.
 *
 * So the rule implemented here is narrow and not negotiable: a claim is inside what the platform can
 * decide only if it can be settled by comparing pictures and text against pictures and text.
 * Movement, water resistance, authenticity: the platform says so plainly, and hands over the
 * external route in the same breath. No component downstream of this file is allowed to soften it,
 * and none of them may promise an outcome.
 */

import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';

/** What a buyer is actually asserting. Deliberately finer-grained than the reason codes: one
 *  reason ("it runs slow") and one disclosure sentence never meet in the middle. */
export type ClaimKind =
  | 'external_condition'
  | 'geometry'
  | 'included_items'
  | 'condition_at_handover'
  | 'mechanical_function'
  | 'water_resistance'
  | 'authenticity';

export const CLAIM_KIND_LABELS: Readonly<Record<ClaimKind, string>> = {
  external_condition: 'How the outside looks',
  geometry: 'Size, shape and proportions',
  included_items: 'What was meant to come with it',
  condition_at_handover: 'What state it was in when it changed hands',
  mechanical_function: 'How it moves and keeps time',
  water_resistance: 'Whether it keeps water out',
  authenticity: 'Whether it is what the listing says it is',
};

/**
 * Settled by comparing the listing's own words and photographs against yours. A person with two
 * photographs and the seller's disclosure text can reach a finding on these.
 */
const WITHIN_PLATFORM_SCOPE: ReadonlySet<ClaimKind> = new Set<ClaimKind>([
  'external_condition',
  'geometry',
  'included_items',
  'condition_at_handover',
]);

/**
 * Not settled here, by anyone, whatever the evidence looks like. These need the item in a workshop
 * or an expert's hands, and the platform has neither.
 */
const OUTSIDE_PLATFORM_SCOPE: ReadonlySet<ClaimKind> = new Set<ClaimKind>([
  'mechanical_function',
  'water_resistance',
  'authenticity',
]);

export function claimIsWithinPlatformScope(kind: ClaimKind): boolean {
  return WITHIN_PLATFORM_SCOPE.has(kind);
}

export function claimIsOutsidePlatformScope(kind: ClaimKind): boolean {
  return OUTSIDE_PLATFORM_SCOPE.has(kind);
}

/** Verbatim, because the sentence is a contract term, not copy. */
export function renderScopeDisclosure(): string {
  return CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition;
}

/** Same sentence keyed off the manifest's own scope, for when the listing set it differently. */
export function disclosureForScope(scope: keyof typeof CLAIM_SCOPE_DISCLOSURE): string {
  return CLAIM_SCOPE_DISCLOSURE[scope];
}

export type RecourseKey = 'watchmaker' | 'service_centre' | 'cgso' | 'small_claims' | 'fraud_report';

export interface RecourseOption {
  readonly key: RecourseKey;
  readonly where: string;
  readonly whatYouGet: string;
  readonly howToStart: string;
  /** Plain-language cost note. Ranges are indicative and say so; nobody reading this is being
   *  quoted a price by NasTech. */
  readonly costNote: string;
  readonly claimsItSpeaksTo: readonly ClaimKind[];
}

/**
 * South African routes, because that is the only market this launches in. Framing rule for every
 * string below: the platform is telling you where else to take it, not telling you that you will
 * win. Copy is a starting point for a reader, not legal advice — the wording is the controller's
 * and legal's to approve before it faces a buyer.
 */
export const EXTERNAL_RECOURSE: readonly RecourseOption[] = [
  {
    key: 'watchmaker',
    where: 'An independent watchmaker or the brand’s service centre, in person',
    whatYouGet:
      'A written assessment of the movement, the actual rate it keeps, and whether the case holds pressure — none of which a photograph of a watch can show.',
    howToStart:
      'Ask for a written report on the item’s reference and movement number, keep the receipts, and send the report here as evidence — the case file reads text.',
    costNote:
      'Independent watchmakers in Joburg typically charge a diagnostic fee before they quote work; a service-centre assessment is usually free with a service booking.',
    claimsItSpeaksTo: ['mechanical_function', 'water_resistance'],
  },
  {
    key: 'service_centre',
    where: 'The brand’s authorised agent, for authenticity and parts questions',
    whatYouGet:
      'A statement of whether the case, dial and movement are original to the piece, and whether it was ever serviced by them.',
    howToStart:
      'They work from the case and movement numbers. Photograph both clearly before you hand the watch over — once it is with an agent you cannot show anything here.',
    costNote: 'Some agents only deal with owners and charge for a letter; check before you travel.',
    claimsItSpeaksTo: ['authenticity'],
  },
  {
    key: 'cgso',
    where: 'The Consumer Goods and Services Ombud (guided by the National Consumer Commission)',
    whatYouGet:
      'A channel that can weigh a transaction between you and a seller where the goods were not as represented — a step the platform itself cannot take on your behalf.',
    howToStart:
      'Keep your listing screenshot, the condition record quoted below, and this dispute’s reference number; they will ask for the paper trail.',
    costNote: 'Complaints to the Ombud are free.',
    claimsItSpeaksTo: ['mechanical_function', 'water_resistance', 'authenticity', 'external_condition'],
  },
  {
    key: 'small_claims',
    where: 'A small claims court, for money under the current threshold',
    whatYouGet: 'A decision by a commissioner with the power to order payment — which NasTech does not have.',
    howToStart:
      'You will need the seller’s details from your order record and this dispute’s file reference.',
    costNote: 'Filing is free for qualifying claims; you represent yourself.',
    claimsItSpeaksTo: ['external_condition', 'included_items', 'condition_at_handover', 'mechanical_function'],
  },
  {
    key: 'fraud_report',
    where: 'Your nearest SAPS station, for goods you believe are counterfeit',
    whatYouGet:
      'A case number. Selling counterfeit goods is a criminal matter under the Counterfeit Goods Act, and a marketplace refund is not a substitute for reporting it.',
    howToStart:
      'Bring the item, the listing, and any written assessment. Take the dispute reference with you; we keep the file open while a report is running.',
    costNote: 'Reporting is free.',
    claimsItSpeaksTo: ['authenticity'],
  },
];

export function recourseForClaims(kinds: readonly ClaimKind[]): readonly RecourseOption[] {
  const wanted = kinds.filter(claimIsOutsidePlatformScope);
  if (wanted.length === 0) return [];
  return EXTERNAL_RECOURSE.filter((option) => option.claimsItSpeaksTo.some((k) => wanted.includes(k)));
}

export interface ClaimVerdict {
  /** Every claim the buyer is making sits inside what a comparison of records can settle. */
  readonly fullyWithinScope: boolean;
  /** At least one claim sits outside it. This is the case the UI must never bury. */
  readonly partlyOutsideScope: boolean;
  readonly outsideClaims: readonly ClaimKind[];
  /** The sentences to show, in order, verbatim where they come from the contract. */
  readonly cannotVerifyLines: readonly string[];
  /** Non-null when this dispute quotes a captured render; the contract's own sentence goes with it. */
  readonly renderDisclosure: string | null;
  readonly recourse: readonly RecourseOption[];
}

/**
 * Why a claim reads as it does, in one sentence per outside claim. The buyer's own claim is quoted
 * back (`whatTheClaimSoundsLike`) so the panel is answering the thing they actually said rather than
 * reciting a policy — and the answer is always "we cannot determine this", never "we will try".
 */
const OUTSIDE_CLAIM_COPY: Readonly<Record<string, string>> = {
  mechanical_function:
    'Whether this watch runs, and how much time it gains or loses per day, cannot be seen in a photograph or a 3D model. NasTech does not run the movement and cannot decide this claim on the pictures alone.',
  water_resistance:
    'Whether this watch keeps water out cannot be seen in a photograph or a 3D model. It is tested on a pressure bench, and NasTech has not put this item on one.',
  authenticity:
    'Whether this watch is genuine cannot be seen in a photograph or a 3D model. A model shows the shape of the thing, not its provenance, and NasTech has not opened the case.',
};

export function whatTheClaimSoundsLike(kind: ClaimKind): string {
  return CLAIM_KIND_LABELS[kind];
}

export function verdictForClaims(kinds: readonly ClaimKind[], opts: { quotesRender: boolean }): ClaimVerdict {
  const outside = kinds.filter(claimIsOutsidePlatformScope);
  const cannotVerifyLines = outside
    .map((kind) => OUTSIDE_CLAIM_COPY[kind])
    .filter((line): line is string => typeof line === 'string');
  return {
    fullyWithinScope: outside.length === 0,
    partlyOutsideScope: outside.length > 0 && outside.length < kinds.length,
    outsideClaims: outside,
    cannotVerifyLines,
    renderDisclosure: opts.quotesRender ? renderScopeDisclosure() : null,
    recourse: recourseForClaims(kinds),
  };
}
