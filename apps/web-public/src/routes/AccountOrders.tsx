import type { RouteDef } from '../router.js';
import { RequireSession } from '../features/auth/routes-guard.js';
import OrdersFeaturePage from '../features/orders/index.js';

/** `/account/orders` — first-paint list view; the orders feature reads the concrete path. */
export default function AccountOrders({ route }: { route: RouteDef }) {
  return (
    <RequireSession label="Sign in to see your orders">
      <div data-page={route.path}>
        <OrdersFeaturePage route={route} />
      </div>
    </RequireSession>
  );
}
