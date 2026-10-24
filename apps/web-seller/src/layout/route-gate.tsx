import { useEffect, type ReactNode } from 'react';
import type { RouteDef } from '../router.js';
import { guardRoute, type GuardDecision } from '../nav/guard.js';
import { pendingActionFor, savePendingAction } from '../lib/pending-action.js';
import type { SellerSessionState } from '../lib/session.js';
import { LoadingState, RedirectingState } from './status.js';

/**
 * Applies `guardRoute` to the route the router already resolved. The decision is the pure
 * function's decision; this component only renders it and performs the one side effect a
 * redirect needs — remembering the blocked screen and asking the controller's navigator to
 * move. Protected content is never mounted in the blocked branch.
 */
export function RouteGate({
  route,
  session,
  activePath,
  navigate,
  children,
}: {
  readonly route: RouteDef;
  readonly session: SellerSessionState;
  readonly activePath: string;
  readonly navigate: (path: string) => void;
  readonly children: ReactNode;
}) {
  const decision = guardRoute(route, session, activePath);

  if (decision.kind === 'allow') return <>{children}</>;
  if (decision.kind === 'hold') {
    return (
      <LoadingState
        title="Checking your seller session"
        detail="This screen is held until the session is confirmed, so nothing private is shown early."
      />
    );
  }

  return <Redirecting decision={decision} navigate={navigate} />;
}

function Redirecting({
  decision,
  navigate,
}: {
  readonly decision: Extract<GuardDecision, { kind: 'redirect' }>;
  readonly navigate: (path: string) => void;
}) {
  useEffect(() => {
    const pending = pendingActionFor(decision.returnTo, Date.now());
    if (pending !== null) savePendingAction(pending);
    navigate(decision.to);
  }, [decision.returnTo, decision.to, navigate]);

  return <RedirectingState to={decision.to} />;
}
