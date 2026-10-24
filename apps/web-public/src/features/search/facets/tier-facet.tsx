import { TIER_LABELS } from '@nastech/api-contracts';
import type { VerificationTier } from '@nastech/api-contracts';
import type { SearchFacetValue } from '@nastech/api-client';
import { CheckboxFacet } from './checkbox-facet.js';

/**
 * Seller-tier facet. The label vocabulary is imported from `@nastech/api-contracts` verbatim —
 * re-declaring tier strings here would put a second copy of disclosure-reviewed language into
 * the world. Values the contract does not recognise render as nothing here, matching the
 * design-system badge's refusal to fall back to a generic "verified".
 */
export function TierFacet({
  values,
  selected,
  onToggle,
}: {
  readonly values: readonly SearchFacetValue[] | null;
  readonly selected: readonly string[];
  readonly onToggle: (value: string) => void;
}) {
  const known =
    values === null
      ? null
      : values.filter((entry) => (TIER_LABELS as Readonly<Record<string, string | undefined>>)[entry.value] !== undefined);
  return (
    <CheckboxFacet
      heading="Seller verification"
      values={known}
      selected={selected}
      onToggle={onToggle}
      labelOf={(value) => TIER_LABELS[value as VerificationTier] ?? value}
    />
  );
}
