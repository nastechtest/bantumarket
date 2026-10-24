import type { RouteDef } from '../router.js';
import { SalesPage } from '../features/sales/sales-page.js';

/** `/orders` — class `app`. */
export default function Sales({ route }: { route: RouteDef }) {
  void route;
  return <SalesPage />;
}
