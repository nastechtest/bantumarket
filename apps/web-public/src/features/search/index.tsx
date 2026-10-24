import type { RouteDef } from '../../router.js';
import { SearchPage } from './search-page.js';

/**
 * Feature entry per the wave convention: the controller wires `routes/Search.tsx` to this
 * default export, and the route definition arrives as data (used here only to tag the surface
 * with the path the fence classified as `first-paint` — search may never reach the scene
 * runtime, statically or lazily, and nothing under this directory imports it).
 */
export default function SearchFeaturePage({ route }: { readonly route: RouteDef }) {
  return (
    <div data-search-route={route.path}>
      <SearchPage />
    </div>
  );
}

export { SearchPage };
export { PARITY_STATEMENT } from './ranking/parity.js';
export { parseSearchState, stateToSearch } from './url-state.js';
export type { SearchState, SearchListing } from './types.js';
export type { ListingSearchTransport, ListingSearchOutcome } from './api/search-transport.js';
