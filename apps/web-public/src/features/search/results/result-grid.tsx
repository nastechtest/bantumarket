import { Grid } from '@nastech/design-system';
import type { SearchListing } from '../types.js';
import { ResultCard } from './result-card.js';

/**
 * Mobile-first results grid: one column at 320px, widening by container query inside the
 * design-system `Grid` — the grid answers "how wide am I", not "what device is this", which is
 * what keeps a thumb-reachable single column on the phone without a viewport media query.
 *
 * The order shown is the order `rank()` returned; this component must not sort, filter or
 * decorate by `has3d`. Nothing here reads that field.
 */
export function ResultGrid({ items }: { readonly items: readonly SearchListing[] }) {
  return (
    <div role="list" aria-label="Search results" data-result-grid="">
      <Grid>
        {items.map((listing) => (
          <div role="listitem" key={listing.id}>
            <ResultCard listing={listing} />
          </div>
        ))}
      </Grid>
    </div>
  );
}
