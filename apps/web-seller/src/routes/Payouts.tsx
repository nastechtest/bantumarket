import type { RouteDef } from '../router.js';
import { PayoutsPage } from '../features/payouts/payouts-page.js';

/** `/payouts` — class `critical`. The shell refuses the page without a seller session. */
export default function Payouts({ route }: { route: RouteDef }) {
  void route;
  return <PayoutsPage />;
}
