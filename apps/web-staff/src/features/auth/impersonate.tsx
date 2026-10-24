import { useState } from 'react';
import { raw } from '@nastech/design-tokens';
import { createAuditStamp } from '../../shell/audit-stamp.js';
import type { AuditStamp } from '../../shell/audit-stamp.js';
import { sessionRefusal } from '../../shell/session.js';
import type { StaffSession } from '../../shell/session.js';
import { ActionButton, Field, Notice, PermissionPanel, SelectField, TextArea } from '../../shell/ui.js';
import { formatInstant } from '../../shell/time.js';
import type { ImpersonationStart, StaffAuthTransport } from './api/staff-auth-transport.js';
import { AuthRefusal } from './api/staff-auth-transport.js';

export const MAX_IMPERSONATION_MINUTES = 60;
export const MIN_IMPERSONATION_REASON = 12;

export interface ImpersonationDraft {
  readonly targetId: string;
  readonly targetLabel: string;
  readonly reason: string;
  readonly durationMinutes: number;
}

export type ImpersonationPlan =
  | { readonly ok: true; readonly stamp: AuditStamp; readonly expiresAt: string }
  | { readonly ok: false; readonly reason: string };

export function planImpersonation(session: StaffSession | null, draft: ImpersonationDraft, now: string): ImpersonationPlan {
  const refusal = sessionRefusal(session, 'impersonate', now);
  if (refusal) return { ok: false, reason: refusal.message };
  const active = session as StaffSession;
  if (active.impersonation !== null) return { ok: false, reason: 'A support session is already open. End it before starting another.' };
  if (!draft.targetId.trim()) return { ok: false, reason: 'Give the account being supported.' };
  if (draft.targetId === active.operatorId) return { ok: false, reason: 'You cannot impersonate your own account.' };
  if (draft.reason.trim().length < MIN_IMPERSONATION_REASON) {
    return { ok: false, reason: `Write at least ${MIN_IMPERSONATION_REASON} characters saying why support needs this.` };
  }
  if (!Number.isInteger(draft.durationMinutes) || draft.durationMinutes < 1 || draft.durationMinutes > MAX_IMPERSONATION_MINUTES) {
    return { ok: false, reason: `Choose a duration between 1 and ${MAX_IMPERSONATION_MINUTES} minutes.` };
  }
  let stamp: AuditStamp;
  try {
    stamp = createAuditStamp({
      actor: active.operatorId,
      role: active.role,
      target: draft.targetId,
      reason: draft.reason,
      at: now,
    });
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'The audit stamp could not be written.' };
  }
  return {
    ok: true,
    stamp,
    expiresAt: new Date(Date.parse(now) + draft.durationMinutes * 60_000).toISOString(),
  };
}

/**
 * Starts a support session. The audit stamp is built first and passed to the transport, so the
 * record of who operated as whom exists even if the transport fails after accepting it.
 */
export async function beginImpersonation(
  transport: Pick<StaffAuthTransport, 'startImpersonation'>,
  session: StaffSession,
  draft: ImpersonationDraft,
  now: string,
): Promise<{ readonly session: StaffSession; readonly stamp: AuditStamp }> {
  const plan = planImpersonation(session, draft, now);
  if (!plan.ok) throw new AuthRefusal('refused', plan.reason);
  if (!transport.startImpersonation) throw new AuthRefusal('unavailable', 'This build has no support-session transport.');
  const request: ImpersonationStart = {
    operatorId: session.operatorId,
    targetId: draft.targetId,
    targetLabel: draft.targetLabel.trim() || draft.targetId,
    reason: draft.reason,
    durationMinutes: draft.durationMinutes,
    stamp: plan.stamp,
  };
  const next = await transport.startImpersonation(request);
  if (next.impersonation === null || next.impersonation.targetId !== draft.targetId) {
    throw new AuthRefusal('refused', 'The server did not return a support session for that account, so none was started.');
  }
  if (next.impersonation.stamp.actor !== plan.stamp.actor || next.impersonation.stamp.at !== plan.stamp.at) {
    throw new AuthRefusal('refused', 'The support session does not match the recorded stamp. The session was refused.');
  }
  return { session: next, stamp: plan.stamp };
}

export async function endImpersonation(
  transport: Pick<StaffAuthTransport, 'endImpersonation'>,
  session: StaffSession,
  now: string,
): Promise<void> {
  if (session.impersonation === null) throw new AuthRefusal('refused', 'There is no support session to end.');
  const stamp = createAuditStamp({
    actor: session.operatorId,
    role: session.role,
    target: session.impersonation.targetId,
    reason: 'Ended support session',
    at: now,
  });
  if (!transport.endImpersonation) throw new AuthRefusal('unavailable', 'This build has no support-session transport.');
  await transport.endImpersonation({
    operatorId: session.operatorId,
    targetId: session.impersonation.targetId,
    at: now,
    stamp,
  });
}

export function ImpersonationBanner({ session, now, onEnd }: { session: StaffSession; now: string; onEnd: () => void }) {
  const active = session.impersonation;
  if (active === null) return null;
  return (
    <div
      role="status"
      data-state="impersonating"
      style={{ position: 'sticky', top: 0, zIndex: 10, background: raw.color.ink900, color: raw.color.paper, padding: raw.space.s2, display: 'flex', gap: raw.space.s3, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.875rem' }}
    >
      <strong>Support session</strong>
      <span>
        {session.displayName} ({session.operatorId}) is operating as {active.targetLabel} ({active.targetId}) until {formatInstant(active.expiresAt)}.
      </span>
      <ActionButton label="End support session" tone="danger" onClick={onEnd} />
      <span style={{ fontSize: '0.75rem' }}>Payout, reconciliation, audit, payout retry and sanctions are refused while this is open.</span>
      <span hidden data-now={now} />
    </div>
  );
}

export function ImpersonatePanel({
  session,
  now,
  transport,
  onStarted,
}: {
  session: StaffSession | null;
  now: string;
  transport: Pick<StaffAuthTransport, 'startImpersonation'>;
  onStarted: (session: StaffSession) => void;
}) {
  const [targetId, setTargetId] = useState('');
  const [targetLabel, setTargetLabel] = useState('');
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState('15');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session === null) return <Notice tone="caution">Sign in before starting a support session.</Notice>;
  if (!session.capabilities.includes('impersonate')) return <PermissionPanel capability="impersonate" />;

  const draft: ImpersonationDraft = { targetId, targetLabel, reason, durationMinutes: Number(minutes) };
  const plan = planImpersonation(session, draft, now);

  return (
    <section aria-labelledby="impersonate-title" style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s3, maxWidth: '32rem' }}>
      <h2 id="impersonate-title" style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.25rem' }}>Operate as an account</h2>
      <Notice tone="caution" title="This is the most sensitive screen in the console">
        Starting a support session writes an audit record before it begins. The session ends on a click or at the stated time, whichever is first.
      </Notice>
      <Field id="impersonate-target-id" label="Account id" value={targetId} onChange={setTargetId} required />
      <Field id="impersonate-target-label" label="Account name shown in the banner" value={targetLabel} onChange={setTargetLabel} />
      <TextArea id="impersonate-reason" label="Why support needs this" value={reason} onChange={setReason} hint={`At least ${MIN_IMPERSONATION_REASON} characters, written for an auditor.`} />
      <SelectField
        id="impersonate-duration"
        label="Session length"
        value={minutes}
        onChange={setMinutes}
        options={[
          { value: '5', label: '5 minutes' },
          { value: '15', label: '15 minutes' },
          { value: '30', label: '30 minutes' },
          { value: '60', label: '60 minutes' },
        ]}
      />
      {error ? <Notice tone="negative" title="The support session was refused">{error}</Notice> : null}
      <ActionButton
        label="Start support session"
        tone="danger"
        busy={busy}
        disabled={!plan.ok}
        disabledReason={plan.ok ? undefined : plan.reason}
        onClick={() => {
          setBusy(true);
          setError(null);
          void beginImpersonation(transport, session, draft, now)
            .then((result) => onStarted(result.session))
            .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'The support session was refused.'))
            .finally(() => setBusy(false));
        }}
      />
      {plan.ok ? <p style={{ margin: 0, fontSize: '0.75rem' }}>Stamp will record {plan.stamp.actor} → {plan.stamp.target} at {formatInstant(plan.stamp.at)}.</p> : null}
    </section>
  );
}
