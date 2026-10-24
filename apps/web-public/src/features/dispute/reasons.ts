/**
 * The reason vocabulary a buyer chooses from, and the single place that knows what each reason is
 * actually a claim about.
 *
 * The mapping `reason → claim kinds` is the hinge of the whole feature: it is what makes the
 * "we cannot verify this" panel appear on the right dispute instead of as boilerplate under every
 * one. `// CONTRACT-GAP:` the PHP `src/Disputes` module owns the canonical reason enum and must
 * accept these codes (listed in the brief-16 report); if its codes differ, this table is the one
 * file that changes, not every component.
 *
 * `quotesRender` is set for the reasons where a buyer will naturally point at the 3D model
 * ("it doesn't look like the render"), which is exactly when the contract's scope sentence has to be
 * on screen.
 */

import type { ClaimKind } from './claim-scope.js';
import type { DisputeSeverity } from './api/dispute-transport.js';

export type DisputeReasonCode =
  | 'exterior_differs_from_listing'
  | 'damage_not_disclosed'
  | 'wrong_size_or_shape'
  | 'missing_accessories'
  | 'damaged_at_handover'
  | 'keeps_bad_time'
  | 'not_running'
  | 'water_ingress'
  | 'suspected_not_genuine'
  | 'not_the_item_i_bought';

export interface DisputeReason {
  readonly code: DisputeReasonCode;
  readonly label: string;
  /** What the buyer should tell us, phrased per reason — better than a generic "describe the issue". */
  readonly whatToDescribe: string;
  readonly claims: readonly ClaimKind[];
  /** This reason is usually raised by pointing at the captured render or poster. */
  readonly quotesRender: boolean;
  readonly suggestedSeverity: DisputeSeverity;
}

export const DISPUTE_REASONS: readonly DisputeReason[] = [
  {
    code: 'exterior_differs_from_listing',
    label: 'The outside is not what the listing showed',
    whatToDescribe:
      'Which part looks different, and what the listing or the condition record said about it.',
    claims: ['external_condition'],
    quotesRender: true,
    suggestedSeverity: 'cosmetic',
  },
  {
    code: 'damage_not_disclosed',
    label: 'There is damage the listing did not disclose',
    whatToDescribe:
      'Where the damage is, and which disclosure you expected to cover it. The condition record is quoted back to you automatically.',
    claims: ['external_condition', 'condition_at_handover'],
    quotesRender: true,
    suggestedSeverity: 'cosmetic',
  },
  {
    code: 'wrong_size_or_shape',
    label: 'It is not the size or shape the listing described',
    whatToDescribe: 'The measurement you expected and the one you have. A photo with a ruler helps.',
    claims: ['geometry'],
    quotesRender: true,
    suggestedSeverity: 'cosmetic',
  },
  {
    code: 'missing_accessories',
    label: 'Box, papers or links are missing',
    whatToDescribe: 'Exactly which items the listing promised and which are not in front of you.',
    claims: ['included_items'],
    quotesRender: false,
    suggestedSeverity: 'cosmetic',
  },
  {
    code: 'damaged_at_handover',
    label: 'It arrived damaged at the handover',
    whatToDescribe: 'What you saw at the meeting, what was said, and what the item looks like now.',
    claims: ['condition_at_handover', 'external_condition'],
    quotesRender: false,
    suggestedSeverity: 'functional',
  },
  {
    code: 'keeps_bad_time',
    label: 'It keeps bad time',
    whatToDescribe:
      'How far out it is, over how many hours, in which positions if you have tried them. Write it out — this is a claim no photograph can carry.',
    claims: ['mechanical_function'],
    quotesRender: false,
    suggestedSeverity: 'functional',
  },
  {
    code: 'not_running',
    label: 'It does not run',
    whatToDescribe:
      'What you did to try to start it and what it does now. A video of the crown and the hands helps, but the words are what the reviewer reads.',
    claims: ['mechanical_function'],
    quotesRender: false,
    suggestedSeverity: 'functional',
  },
  {
    code: 'water_ingress',
    label: 'Moisture got inside',
    whatToDescribe:
      'When you last had it near water, what changed afterwards, and whether condensation is visible.',
    claims: ['water_resistance', 'external_condition'],
    quotesRender: false,
    suggestedSeverity: 'functional',
  },
  {
    code: 'suspected_not_genuine',
    label: 'I do not believe it is genuine',
    whatToDescribe:
      'What specifically made you doubt it — markings, weight, movement, paperwork. Be precise; this is the claim the platform is least able to settle.',
    claims: ['authenticity'],
    quotesRender: false,
    suggestedSeverity: 'unknown',
  },
  {
    code: 'not_the_item_i_bought',
    label: 'A different item was handed to me',
    whatToDescribe:
      'The reference on the listing against the reference on the item you hold, both written out.',
    claims: ['external_condition', 'geometry', 'authenticity'],
    quotesRender: true,
    suggestedSeverity: 'functional',
  },
];

const BY_CODE = new Map<string, DisputeReason>(DISPUTE_REASONS.map((r) => [r.code, r]));

export function reasonByCode(code: string | null | undefined): DisputeReason | null {
  if (code === null || code === undefined) return null;
  return BY_CODE.get(code) ?? null;
}

/** Unknown codes from a service read must still render something honest rather than throw away the
 *  buyer's dispute. */
export function reasonLabelOrFallback(code: string | null): string {
  const reason = reasonByCode(code);
  return reason ? reason.label : 'Something else about this item';
}

export function claimKindsForCode(code: string | null): readonly ClaimKind[] {
  const reason = reasonByCode(code);
  return reason ? reason.claims : [];
}

/** Every reason code the UI can currently send — the reconciliation list for the PHP side. */
export const DISPUTE_REASON_CODES: readonly DisputeReasonCode[] = DISPUTE_REASONS.map((r) => r.code);
