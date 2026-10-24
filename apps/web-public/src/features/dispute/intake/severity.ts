/**
 * Severity, in the buyer's words, with the two things it is not made to promise.
 *
 * Severity is the one field a buyer believes is doing more work than it is. Picking "the watch does
 * not run" does not make the platform able to hear a movement, and it does not buy a shorter clock —
 * the service sets the clock and `timeline/sla-clock.tsx` reads what it was given. So each row here
 * carries what the choice actually changes (which sentence a reviewer reads first, and what evidence
 * would help them) and an explicit `notAPromise`.
 *
 * The three values are `ConditionCaption['severity']` from `@nastech/api-contracts`, joined by
 * import rather than by re-typing, so a dispute about a disclosed mark and the caption that disclosed
 * it speak the same language.
 */

import type { DisputeSeverity } from '../api/dispute-transport.js';
import { reasonByCode } from '../reasons.js';

export interface SeverityGuidance {
  readonly value: DisputeSeverity;
  readonly label: string;
  readonly whatItMeans: string;
  readonly helpsTheReviewer: string;
  readonly notAPromise: string;
}

export const SEVERITY_SCALE: readonly SeverityGuidance[] = [
  {
    value: 'cosmetic',
    label: 'A mark or a detail, not a fault',
    whatItMeans:
      'The item can be worn and used; something about it is not what the listing showed, or the seller did not mention it.',
    helpsTheReviewer:
      'One clear photo of the mark next to the disclosure sentence you believe it contradicts. That comparison is the whole case.',
    notAPromise:
      'A cosmetic claim is the one thing we can decide from photographs. It does not mean we will agree with you about how visible it is.',
  },
  {
    value: 'functional',
    label: 'It does not do what it should do',
    whatItMeans:
      'You are saying the item fails at its job — it stops, runs badly, let water in, or something is missing that made it work.',
    helpsTheReviewer:
      'A written account of what you did and what happened, in order. A short video helps; the words are what gets read, because a video of a watch tells a reviewer nothing about its movement.',
    notAPromise:
      'Choosing this does not mean NasTech has tested the item. We cannot run a movement or put a case on a pressure bench, and a reviewer deciding a functional claim is deciding what the record says, not what the watch does.',
  },
  {
    value: 'unknown',
    label: 'I cannot tell what is wrong',
    whatItMeans:
      'Something is off compared with the listing or with what you expected, and you cannot yet put it into a category.',
    helpsTheReviewer:
      'Say what you noticed first, in the order you noticed it. "The seller said serviced, the second hand stutters" is more useful than a conclusion.',
    notAPromise:
      'This is not a weaker dispute and not a stronger one. It does decide what we ask you next, and we will ask rather than assume.',
  },
];

const BY_VALUE = new Map<DisputeSeverity, SeverityGuidance>(SEVERITY_SCALE.map((g) => [g.value, g]));

export function severityGuidance(value: DisputeSeverity | null): SeverityGuidance | null {
  if (value === null) return null;
  return BY_VALUE.get(value) ?? null;
}

/** The reason the buyer picked may imply a severity. It is a suggestion rendered as a pre-selection,
 *  never a lock: "it arrived damaged" and "it does not run" can both be cosmetic to one buyer. */
export function suggestedSeverityForCode(code: string | null): DisputeSeverity | null {
  const reason = reasonByCode(code);
  return reason ? reason.suggestedSeverity : null;
}

export const SEVERITY_ORDER: readonly DisputeSeverity[] = ['cosmetic', 'functional', 'unknown'];

/**
 * The line that goes under a severity picker whenever the dispute leaves the platform's scope. Kept
 * here so both the picker and the review screen say it identically.
 */
export const SEVERITY_SCOPE_NOTE =
  'How bad it is, in your words. It changes what a reviewer asks you for; it does not change what NasTech is able to test, and it is not a promise about the outcome.';
