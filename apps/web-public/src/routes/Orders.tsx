import type { RouteDef } from '../router.js';
import { RequireSession } from '../features/auth/routes-guard.js';
import OrdersFeaturePage from '../features/orders/index.js';

/** `/orders` — critical: the list exposes order and money state, so the session is re-verified. */
export default function Orders({ route }: { route: RouteDef }) {
  return (
    <RequireSession label="Sign in to see your orders">
      <div data-page={route.path}>
        <OrdersFeaturePage route={route} />
      </div>
    </RequireSession>
  );
}
