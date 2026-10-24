import type { RouteDef } from '../../router.js';
import { SearchPage } from './search-page.js';

/**
 * Route wrapper kept in its own .tsx so `index.ts` stays pure re-export (JSX in a `.ts` file is
 * a syntax error; wave A learned this the hard way). The route definition arrives as data from
 * the controller's router and is used here only to tag the surface with the path the fence
 * classified as `first-paint` — search may never reach the scene runtime, statically or lazily,
 * and nothing under this directory imports it.
 */
export function SearchFeaturePage({ route }: { readonly route: RouteDef }) {
  return (
    <div data-search-route={route.path}>
      <SearchPage />
    </div>
  );
}
