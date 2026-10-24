import type { RouteDef } from '../router.js';
import { RequireSession } from '../features/auth/routes-guard.js';
import { AccountOverview } from '../features/account/index.js';

/** `/account` — first-paint. The gate re-verifies with the server before showing anything private. */
export default function Account({ route }: { route: RouteDef }) {
  return (
    <RequireSession label="Sign in to see your account">
      <div data-page={route.path}>
        <AccountOverview />
      </div>
    </RequireSession>
  );
}
