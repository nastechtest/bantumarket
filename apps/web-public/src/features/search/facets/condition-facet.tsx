import type { SearchFacetValue } from '@nastech/api-client';
import { CONDITION_LABELS } from '../types.js';
import type { ConditionGrade } from '../types.js';
import { CheckboxFacet } from './checkbox-facet.js';

/**
 * Condition facet. Labels come from the local pilot vocabulary (CONTRACT-GAP: api-contracts has
 * no condition enum yet — see types.ts); counts come only from the response passed in by the
 * panel. This component cannot invent a count even if it wanted to; it never sees the items.
 */
export function ConditionFacet({
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
      heading="Condition"
      values={values}
      selected={selected}
      onToggle={onToggle}
      labelOf={(value) => CONDITION_LABELS[value as ConditionGrade] ?? value}
    />
  );
}
