import type { AuditStamp } from './audit-stamp.js';
import { createAuditStamp } from './audit-stamp.js';
import type { Capability } from './permissions.js';
import { IMPERSONATION_FORBIDDEN_CAPABILITIES } from './permissions.js';
import { sessionRefusal } from './session.js';
import type { SessionRefusal, StaffSession } from './session.js';

export class ActionRefused extends Error {
  readonly refusal: SessionRefusal | { code: 'invalid_reason'; message: string };

  constructor(refusal: SessionRefusal | { code: 'invalid_reason'; message: string }) {
    super(refusal.message);
    this.name = 'ActionRefused';
    this.refusal = refusal;
  }
}

export interface AuditedActionInput<T> {
  readonly session: StaffSession | null;
  readonly capability: Capability;
  readonly target: string;
  readonly reason: string;
  /** The server instant, not a local clock reading. */
  readonly now: string;
  readonly impersonationForbidden?: readonly Capability[];
  readonly perform: (stamp: AuditStamp) => Promise<T>;
}

export interface AuditedActionOutcome<T> {
  readonly value: T;
  readonly stamp: AuditStamp;
}

/**
 * The only sanctioned mutation path in the console. It refuses before calling `perform` when the
 * session lacks the capability, when impersonation forbids the capability, or when the reason is
 * empty — so a transport is never reached without a complete stamp.
 */
export async function runAuditedAction<T>(input: AuditedActionInput<T>): Promise<AuditedActionOutcome<T>> {
  const refusal = sessionRefusal(input.session, input.capability, input.now, {
    impersonationForbidden: input.impersonationForbidden ?? IMPERSONATION_FORBIDDEN_CAPABILITIES,
  });
  if (refusal) throw new ActionRefused(refusal);
  const session = input.session as StaffSession;
  let stamp: AuditStamp;
  try {
    stamp = createAuditStamp({
      actor: session.operatorId,
      role: session.role,
      target: input.target,
      reason: input.reason,
      at: input.now,
    });
  } catch (error) {
    throw new ActionRefused({
      code: 'invalid_reason',
      message: error instanceof Error ? error.message : 'A reason is required.',
    });
  }
  const value = await input.perform(stamp);
  return { value, stamp };
}

export interface MutationControlDecision {
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly reason: string | null;
}

/**
 * How a screen decides about a mutating control. `forceVisible` exists because hiding is not
 * authorisation: the disabled-with-reason rendering is also a tested state, and a caller can
 * ask for it to prove the server-facing path refuses.
 */
export function mutationControl(
  session: StaffSession | null,
  capability: Capability,
  now: string,
  options: { readonly reason?: string; readonly forceVisible?: boolean } = {},
): MutationControlDecision {
  const refusal = sessionRefusal(session, capability, now, {
    impersonationForbidden: IMPERSONATION_FORBIDDEN_CAPABILITIES,
  });
  if (refusal === null) {
    const reason = options.reason?.trim() ?? '';
    return reason.length === 0
      ? { visible: true, disabled: true, reason: 'Give a reason before this action can run.' }
      : { visible: true, disabled: false, reason: null };
  }
  return {
    visible: options.forceVisible === true,
    disabled: true,
    reason: refusal.message,
  };
}
