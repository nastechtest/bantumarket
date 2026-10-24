import type { StaffSession } from '../shell/session.js';
import { roleLabel } from '../shell/role.js';
import { formatDuration, formatInstant } from '../shell/time.js';

/**
 * The banner is the audit trail's visible half: while a support session is open, every screen says
 * who is operating and whose account they are looking through. It has no dismiss control on purpose
 * — dismissing it would turn an impersonation into an ordinary session. Ending one is a hard action
 * owned by the auth feature, not a close button on a notice.
 */
export function ImpersonationBanner({ session, nowIso }: { session: StaffSession; nowIso: string }) {
  const impersonation = session.impersonation;
  if (impersonation === null) return null;

  const endsAt = Date.parse(impersonation.expiresAt);
  const now = Date.parse(nowIso);
  const timingKnown = !Number.isNaN(endsAt) && !Number.isNaN(now);
  const ended = timingKnown && now >= endsAt;
  const remaining = timingKnown ? Math.max(0, endsAt - now) : 0;

  return (
    <section
      className="ops-impersonation"
      data-testid="impersonation-banner"
      data-state={ended ? 'ended' : 'active'}
      role="status"
      aria-live="polite"
    >
      <p className="ops-impersonation-title">
        {ended ? 'Support session ended' : <>Impersonating <strong>{impersonation.targetLabel}</strong></>}
      </p>
      <p className="ops-impersonation-detail">
        Operator <strong>{session.displayName}</strong> ({roleLabel(session.role)}) · Reason:{' '}
        {impersonation.reason} ·{' '}
        {ended
          ? `ended ${formatInstant(impersonation.expiresAt)}`
          : `${formatDuration(remaining)} left, ends ${formatInstant(impersonation.expiresAt)}`}
      </p>
      <p className="ops-impersonation-lock">
        Payouts, reconciliation and audit are closed while this banner is present. Every action is
        attributed to the operator and the target.
      </p>
    </section>
  );
}
