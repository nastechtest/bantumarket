import type { SearchFacetValue } from '@nastech/api-client';
import { locationLabel } from '../types.js';
import { CheckboxFacet } from './checkbox-facet.js';

/**
 * Location facet. The pilot is one city, so this facets on suburb, not metro — the supply plan
 * reads "people in Fourways want watches near Fourways" as the pickup-trip-length signal the
 * handover model depends on.
 */
export function LocationFacet({
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
      heading="Pickup area"
      values={values}
      selected={selected}
      onToggle={onToggle}
      labelOf={locationLabel}
    />
  );
}
