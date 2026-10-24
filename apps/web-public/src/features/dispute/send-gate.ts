/**
 * Why the send button is disabled, in the buyer's terms, in one place.
 *
 * The gate lives here rather than in the component so the button and the explanation cannot disagree,
 * and so a scope warning that has not been acknowledged cannot be bypassed by a screen that forgot to
 * ask. A component that renders its own "disabled because reason" string will drift the first time the
 * copy changes; this returns the copy.
 *
 * The order is the argument: a reason, then a severity, then a statement long enough to review, and
 * only then the rights acknowledgement — which is asked *only* when the claim actually reaches outside
 * what the platform can decide. A cosmetic warning on every dispute would train buyers to tick things
 * without reading them, which is worse than not asking.
 */
import type { DisputeSeverity } from './api/dispute-transport.js';
import { claimIsOutsidePlatformScope } from './claim-scope.js';
import { statementProblem } from './limits.js';
import { reasonByCode } from './reasons.js';

/** The reason must be picked before the gate question can even be asked. */
export function requiresRightsAck(reasonCode: string | null): boolean {
  const reason = reasonByCode(reasonCode);
  if (reason === null) return false;
  return reason.quotesRender || reason.claims.some(claimIsOutsidePlatformScope);
}

export interface SendGateInput {
  readonly reasonCode: string | null;
  readonly severity: DisputeSeverity | null;
  readonly statement: string;
  readonly readRightsAcknowledged: boolean;
}

export interface SendGate {
  readonly ok: boolean;
  readonly reason: string | null;
}

export function sendGate(input: SendGateInput): SendGate {
  if (input.reasonCode === null) return { ok: false, reason: 'Choose what is wrong before you send this.' };
  if (input.severity === null) return { ok: false, reason: 'Say how bad it is, in your own words.' };
  const problem = statementProblem(input.statement);
  if (problem === 'too_short') {
    return { ok: false, reason: 'A reviewer needs enough to compare against the listing — a sentence or two more.' };
  }
  if (problem === 'too_long') {
    return { ok: false, reason: 'Trim it: keep the part a reviewer can compare with the listing.' };
  }
  if (requiresRightsAck(input.reasonCode) && !input.readRightsAcknowledged) {
    return { ok: false, reason: 'Tick that you have read what NasTech can and cannot decide about this.' };
  }
  return { ok: true, reason: null };
}
