import type { RouteDef } from '../router.js';
import { RequireSession } from '../features/auth/routes-guard.js';
import OrdersFeaturePage from '../features/orders/index.js';

/** `/orders/:orderId` — critical: cancel and dispute actions on a money-bearing order live here. */
export default function OrderDetail({ route }: { route: RouteDef }) {
  return (
    <RequireSession label="Sign in to open this order">
      <div data-page={route.path}>
        <OrdersFeaturePage route={route} />
      </div>
    </RequireSession>
  );
}
