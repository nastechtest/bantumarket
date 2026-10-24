import type { Capability } from '../shell/permissions.js';
import { roleToAsk } from '../shell/permissions.js';
import type { AccessDenialReason } from '../nav/access.js';

/**
 * Full-page chrome states. The shell owns these because a route that forgot its empty state used to
 * render a blank main landmark, which a staff member cannot tell apart from a permissions refusal.
 */
export function LoadingState({ label = 'this screen' }: { label?: string }) {
  return (
    <section className="ops-state" data-state="loading" role="status" aria-live="polite" aria-busy="true">
      <p className="ops-state-body">Loading {label}…</p>
    </section>
  );
}

export interface EmptyAction {
  readonly label: string;
  readonly onAction: () => void;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: EmptyAction }) {
  return (
    <section className="ops-state" data-state="empty">
      <h2 className="ops-state-title">{title}</h2>
      <p className="ops-state-body">{body}</p>
      {action === undefined ? null : (
        <button type="button" className="ops-button" onClick={action.onAction}>
          {action.label}
        </button>
      )}
    </section>
  );
}

export function ErrorState({ title = 'That did not load', body, onRetry }: { title?: string; body: string; onRetry?: () => void }) {
  return (
    <section className="ops-state" data-state="error" role="alert">
      <h2 className="ops-state-title">{title}</h2>
      <p className="ops-state-body">{body}</p>
      {onRetry === undefined ? null : (
        <button type="button" className="ops-button" onClick={onRetry}>
          Try again
        </button>
      )}
    </section>
  );
}

function SignInState({ title, body }: { title: string; body: string }) {
  return (
    <section className="ops-state" data-state="signed-out">
      <h1 className="ops-state-title">{title}</h1>
      <p className="ops-state-body">{body}</p>
      <a className="ops-button" href="/sign-in">
        Go to sign in
      </a>
    </section>
  );
}

/**
 * The refusal a page sees when it is not entitled to render. The copy names only the capability, the
 * role that grants it, and the impersonation state. It never echoes the requested path or id and it
 * never distinguishes a missing record from a forbidden one — that difference is an existence
 * oracle, and staff consoles are a popular target for exactly that probe.
 */
export function PermissionDenied({ capability }: { capability: Capability | null }) {
  return (
    <section className="ops-state" data-state="permission-denied" data-reason="capability">
      <h1 className="ops-state-title">Your role does not include this</h1>
      {capability === null ? (
        <p className="ops-state-body">This screen is not part of your console.</p>
      ) : (
        <p className="ops-state-body">
          This screen requires the capability <code>{capability}</code>. Ask someone with the{' '}
          <strong>{roleToAsk(capability)}</strong> role to grant it.
        </p>
      )}
      <p className="ops-state-body">
        Access is decided by the server. This page does not confirm whether the record you asked for
        exists.
      </p>
    </section>
  );
}

function ImpersonationDenied() {
  return (
    <section className="ops-state" data-state="permission-denied" data-reason="impersonation">
      <h1 className="ops-state-title">Not available while impersonating</h1>
      <p className="ops-state-body">
        Payouts, reconciliation and audit are closed to an impersonating session. End the
        impersonation and sign in again before using this screen.
      </p>
    </section>
  );
}

export function AccessState({ reason, capability }: { reason: AccessDenialReason; capability: Capability | null }) {
  switch (reason) {
    case 'signed-out':
      return (
        <SignInState
          title="Sign in to use the console"
          body="This console is limited to staff accounts. Sign in with your staff credentials and a second factor."
        />
      );
    case 'mfa-required':
      return (
        <SignInState
          title="A second factor is required"
          body="This session has not completed multi-factor sign-in, so no staff screen will render."
        />
      );
    case 'session-expired':
      return (
        <SignInState
          title="Session ended"
          body="Your session expired. Sign in again; nothing unsent was submitted."
        />
      );
    case 'impersonation-ended':
      return (
        <SignInState
          title="Support session ended"
          body="The impersonation window closed. Return to your own session before opening another screen."
        />
      );
    case 'impersonation-blocked':
      return <ImpersonationDenied />;
    case 'missing-capability':
      return <PermissionDenied capability={capability} />;
  }
}
