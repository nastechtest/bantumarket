import { EmptyState } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import { describeActiveFilters, hasActiveFilters } from '../facets/facet-state.js';
import type { SearchState } from '../types.js';
import { relatedCategories } from './related-categories.js';
import type { SearchFacet } from '@nastech/api-client';

/**
 * The genuine zero-result screen: the index answered, and the answer was "nothing matches".
 * In a one-city watch pilot this screen is a supply signal worth reading, so it echoes the
 * query verbatim, names the filters that squeezed the result to zero, and offers exactly one
 * action phrased as broadening — a zero-results page with three buttons offers none.
 *
 * This screen and `no-index-yet.tsx` must never share a sentence. A buyer shown "nothing
 * matches" while the index was down tells the supply team there is no demand, which is the
 * opposite of the truth.
 */
export function ZeroResult({
  state,
  facets,
  onClearFilters,
  onSeeAll,
  onPickCategory,
}: {
  readonly state: SearchState;
  readonly facets: readonly SearchFacet[];
  readonly onClearFilters: () => void;
  readonly onSeeAll: () => void;
  readonly onPickCategory: (slug: string) => void;
}) {
  const filtersOn = hasActiveFilters(state);
  const active = describeActiveFilters(state);
  const related = relatedCategories(facets, state.categories);

  return (
    <section data-variant="zero-results" data-supply-signal="true" aria-label="No results">
      <EmptyState
        query={state.q === '' ? 'this combination' : state.q}
        actionLabel={filtersOn ? 'Clear filters' : 'See all pilot listings'}
        onAction={filtersOn ? onClearFilters : onSeeAll}
      />
      {filtersOn && active.length > 0 ? (
        <p style={{ margin: raw.space.s3, color: tokens.text.secondary, fontSize: '0.8125rem' }}>
          Still filtering by: {active.join(', ')}.
        </p>
      ) : null}
      {related.length > 0 ? (
        <div style={{ margin: raw.space.s3, display: 'flex', gap: raw.space.s2, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8125rem', color: tokens.text.secondary, width: '100%' }}>
            Nearby in supply right now:
          </span>
          {related.map((category) => (
            <button
              key={category.slug}
              type="button"
              onClick={() => onPickCategory(category.slug)}
              style={{
                minHeight: 44,
                padding: `${raw.space.s2} ${raw.space.s4}`,
                border: `1px solid ${raw.color.ink100}`,
                borderRadius: raw.radius.pill,
                background: tokens.surface.primary,
                color: tokens.action.default,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              {category.label} ({category.count})
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
