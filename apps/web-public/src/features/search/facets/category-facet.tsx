import type { SearchFacetValue } from '@nastech/api-client';
import { categoryLabel } from '../types.js';
import { CheckboxFacet } from './checkbox-facet.js';

/** Category facet for the one-city watch pilot. Slug→label mapping lives in types.ts. */
export function CategoryFacet({
  values,
  selected,
  onToggle,
}: {
  readonly values: readonly SearchFacetValue[] | null;
  readonly selected: readonly string[];
  readonly onToggle: (value: string) => void;
}) {
  return (
    <CheckboxFacet
      heading="Category"
      values={values}
      selected={selected}
      onToggle={onToggle}
      labelOf={categoryLabel}
    />
  );
}
