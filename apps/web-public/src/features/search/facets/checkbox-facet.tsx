import { raw, tokens } from '@nastech/design-tokens';
import type { SearchFacetValue } from '@nastech/api-client';

/**
 * The shared option list behind the checkbox facets. Kept internal to facets/ — one file exists
 * so the mobile rules (44px row, count from the response, zero-count values visible but inert)
 * are written once. This is not a facade: every real behaviour of a checkbox facet lives here.
 */

export interface CheckboxFacetProps {
  readonly heading: string;
  /** From the search response. Null means "this response has not answered this facet yet". */
  readonly values: readonly SearchFacetValue[] | null;
  readonly selected: readonly string[];
  readonly onToggle: (value: string) => void;
  readonly labelOf: (value: string) => string;
}

export function CheckboxFacet({ heading, values, selected, onToggle, labelOf }: CheckboxFacetProps) {
  return (
    <fieldset
      data-facet={heading}
      style={{
        border: 'none',
        margin: 0,
        padding: 0,
        fontFamily: raw.type.familyText,
        color: tokens.text.primary,
      }}
    >
      <legend style={{ fontSize: '0.875rem', fontWeight: 600, paddingBottom: raw.space.s1 }}>
        {heading}
      </legend>
      {values === null ? (
        <p data-facet-pending="true" style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem' }}>
          Counts arrive with the results.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {values.map((entry) => {
            const isSelected = selected.includes(entry.value);
            // A zero count is shown, never hidden and never recomputed locally; but an
            // unselected zero-count value cannot produce results, so it is inert, not clickable.
            const inert = entry.count === 0 && !isSelected;
            return (
              <li key={entry.value}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: raw.space.s2,
                    minHeight: 44,
                    fontSize: '0.9375rem',
                    cursor: inert ? 'default' : 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={inert}
                    onChange={() => onToggle(entry.value)}
                    style={{ width: 20, height: 20, margin: 0, accentColor: tokens.action.default }}
                  />
                  <span>{labelOf(entry.value)}</span>
                  <span
                    data-facet-count={entry.count}
                    style={{
                      marginLeft: 'auto',
                      fontVariantNumeric: 'tabular-nums',
                      color: inert ? tokens.text.disabled : tokens.text.secondary,
                      fontSize: '0.8125rem',
                    }}
                  >
                    {entry.count}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
