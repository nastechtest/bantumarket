import type { RouteDef } from '../router.js';
import { NewListingPage } from '../features/listings/new-listing-page.js';

/** `/listings/new` — class `app`. */
export default function NewListing({ route }: { route: RouteDef }) {
  void route;
  return <NewListingPage />;
}
