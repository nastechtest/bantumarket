/**
 * Critical route: a dispute is a money claim, so it is gated. Evidence upload is a file input, not
 * a camera or a render, and the whole graph below stays clear of the scene runtime.
 *
 * `RequireSession` re-verifies with the server on every mount rather than trusting a stored flag,
 * so an anonymous visitor gets the sign-in form and never the intake; `useDispute` independently
 * refuses a null principal, which is why the gate has a proof behind it instead of only a promise.
 */
import type { RouteDef } from '../router.js';
import { RequireSession } from '../features/auth/routes-guard.js';
import DisputeFeaturePage from '../features/dispute/index.js';

export default function Dispute({ route }: { route: RouteDef }) {
  return (
    <RequireSession label="Sign in to open this dispute">
      <DisputeFeaturePage route={route} />
    </RequireSession>
  );
}
