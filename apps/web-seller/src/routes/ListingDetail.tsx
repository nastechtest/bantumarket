import { stripBase, type RouteDef } from '../router.js';
import { pathParam } from '../lib/path-param.js';
import { ListingDetailPage } from '../features/listings/listing-detail-page.js';

/** `/listings/:id` — class `app`. Resolves `:id` from the concrete pathname. */
export default function ListingDetail({ route }: { route: RouteDef }) {
  const pathname = typeof window === 'undefined' ? '' : stripBase(window.location.pathname);
  return <ListingDetailPage listingId={pathParam(route.path, 'id', pathname)} />;
}
