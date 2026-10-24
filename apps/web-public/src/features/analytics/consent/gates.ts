/**
 * The gate: the single decision that answers "may this event be collected right now?".
 *
 * It is a separate module because the answer needs one owner and three callers (the tracker, the
 * queue's re-check at flush time, and the withdrawal path), and because the *reasons* are as important
 * as the verdict: a dropped event that reports no reason is indistinguishable from a bug, a refusal,
 * or a buyer who never agreed — and those four need completely different responses.
 *
 * The ordering is deliberate:
 *  1. no session → refuse (an event with no session cannot be bounded to a consent, so it is not
 *     collectable at all; this is also the no-entropy path from `session.ts`);
 *  2. category not permitted → refuse with the reason a support agent can read;
 *  3. anything else → allow, and let the schema decide the rest.
 */
import { CONSENT_GATED, NEVER_COLLECTED } from '../../../lib/consent/types.js';
import type { ConsentCategory } from '../../../lib/consent/types.js';
import { categoryOf, type EventName } from '../events.js';

export type GateReason =
  | 'allowed'
  | 'no_consent_decision'
  | 'category_refused'
  | 'category_never_collected'
  | 'not_consent_gated'
  | 'no_session'
  | 'withdrawn'
  | 'sealed_for_withdrawal';

export interface GateVerdict {
  readonly allowed: boolean;
  readonly reason: GateReason;
  readonly category: ConsentCategory;
  /** Only when the refusal is something a developer should fix, not a buyer's choice. */
  readonly actionable: boolean;
  readonly message: string;
}

export interface GateInput {
  readonly name: EventName;
  readonly consentAllowed: (category: ConsentCategory) => boolean;
  readonly hasDecided: boolean;
  readonly sessionAvailable: boolean;
  readonly sealed?: boolean;
}

/**
 * Pure, synchronous, allocation-light: this runs on every event on a mobile device in a tap handler.
 */
export function gate(input: GateInput): GateVerdict {
  const category = categoryOf(input.name);
  const sealed = input.sealed === true;

  if (sealed && category !== 'essential') {
    return verdict(category, false, 'sealed_for_withdrawal', true, `${input.name} blocked while a withdrawal is being applied`);
  }
  if (!input.sessionAvailable && category !== 'essential') {
    return verdict(
      category,
      false,
      'no_session',
      true,
      `${input.name} blocked: without a rotating session reference there is nothing bounding this row to a consent, so it cannot be collected at all`,
    );
  }
  if (NEVER_COLLECTED.includes(category)) {
    return verdict(category, false, 'category_never_collected', true, `${input.name} belongs to "${category}", which this product does not process for`);
  }
  if (!CONSENT_GATED.includes(category)) {
    // `essential` reaches here. It is allowed by basis; anything else that is not gated means the
    // registry and the gate disagree, which is a developer bug and must say so.
    if (category === 'essential') return verdict(category, true, 'allowed', false, 'essential processing rests on a lawful basis, not on consent');
    return verdict(category, false, 'not_consent_gated', true, `${input.name} has category "${category}" which is neither consented nor essential`);
  }
  if (!input.hasDecided) {
    return verdict(
      category,
      false,
      'no_consent_decision',
      false,
      `${input.name} not collected: the buyer has not been answered yet, and consent is given before processing, not during it`,
    );
  }
  if (!input.consentAllowed(category)) {
    return verdict(category, false, 'category_refused', false, `${input.name} not collected: ${category} is refused`);
  }
  return verdict(category, true, 'allowed', false, `${input.name} may be collected under ${category}`);
}

function verdict(category: ConsentCategory, allowed: boolean, reason: GateReason, actionable: boolean, message: string): GateVerdict {
  return { allowed, reason, category, actionable, message };
}

/**
 * The queue's last-moment check. Written separately from `gate` because the queue is not allowed to
 * know about event names or sessions — it only knows categories — and because a category that became
 * unpermitted between push and flush is exactly the withdrawal race this whole layer exists to close.
 */
export function categoryGate(consentAllowed: (category: ConsentCategory) => boolean) {
  return (category: ConsentCategory): boolean => {
    if (category === 'essential') return true;
    if (NEVER_COLLECTED.includes(category)) return false;
    return consentAllowed(category);
  };
}

/** For `consent-gates.test.ts`: every gated category, and nothing else, is the set the gate can switch on. */
export const GATED: readonly ConsentCategory[] = CONSENT_GATED;
