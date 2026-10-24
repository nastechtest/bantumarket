import { raw, tokens } from '@nastech/design-tokens';
import type { SearchFacet } from '@nastech/api-client';
import type { MultiFacetName, SearchState } from '../types.js';
import { activeFacetCount, facetSelection, valuesFor } from './facet-state.js';
import { ConditionFacet } from './condition-facet.js';
import { TierFacet } from './tier-facet.js';
import { CategoryFacet } from './category-facet.js';
import { LocationFacet } from './location-facet.js';
import { PriceFacet } from './price-facet.js';

/**
 * The facet panel, rendered inside the mobile bottom `Sheet` — never a mouse-assuming sidebar.
 * It is also what the sheet *contains*, so the same panel serves a future desktop rail without
 * a second implementation; the owning page decides the container.
 */
export function FacetPanel({
  state,
  facets,
  onToggleFacet,
  onPriceRange,
  onClearAll,
}: {
  readonly state: SearchState;
  readonly facets: readonly SearchFacet[];
  readonly onToggleFacet: (name: MultiFacetName, value: string) => void;
  readonly onPriceRange: (minCents: number | null, maxCents: number | null) => void;
  readonly onClearAll: () => void;
}) {
  const count = activeFacetCount(state);
  const selection = (name: MultiFacetName): readonly string[] => facetSelection(state, name);
  const toggle = (name: MultiFacetName) => (value: string) => onToggleFacet(name, value);

  return (
    <div
      data-facet-panel=""
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: raw.space.s5,
        fontFamily: raw.type.familyText,
        color: tokens.text.primary,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.875rem' }} data-active-filter-count={count}>
          {count === 0 ? 'No filters yet' : count === 1 ? '1 filter on' : `${count} filters on`}
        </p>
        <button
          type="button"
          onClick={onClearAll}
          disabled={count === 0}
          style={{
            minHeight: 44,
            padding: `${raw.space.s2} ${raw.space.s3}`,
            background: 'transparent',
            color: count === 0 ? tokens.text.disabled : tokens.action.default,
            border: 'none',
            borderBottom: `2px solid ${count === 0 ? 'transparent' : raw.color.accent600}`,
            fontSize: '0.9375rem',
            cursor: count === 0 ? 'default' : 'pointer',
          }}
        >
          Clear all
        </button>
      </div>

      <ConditionFacet values={valuesFor(facets, 'condition')} selected={selection('condition')} onToggle={toggle('condition')} />
      <TierFacet values={valuesFor(facets, 'sellerTier')} selected={selection('sellerTier')} onToggle={toggle('sellerTier')} />
      <CategoryFacet values={valuesFor(facets, 'category')} selected={selection('category')} onToggle={toggle('category')} />
      <LocationFacet values={valuesFor(facets, 'location')} selected={selection('location')} onToggle={toggle('location')} />
      <PriceFacet minCents={state.priceMinCents} maxCents={state.priceMaxCents} onApply={onPriceRange} />
    </div>
  );
}
