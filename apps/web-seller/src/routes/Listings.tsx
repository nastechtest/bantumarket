import type { RouteDef } from '../router.js';
import { ListingsPage } from '../features/listings/listings-page.js';

/** `/listings` — class `app`. The feature owns the screen; this file is the router seam. */
export default function Listings({ route }: { route: RouteDef }) {
  void route;
  return <ListingsPage />;
}
