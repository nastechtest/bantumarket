import type { SearchFacet } from '@nastech/api-client';
import { categoryLabel } from '../types.js';

/**
 * "Related categories" on the zero-result screen are read off the *response's* facet counts —
 * categories where the index itself says supply exists — never off a hard-coded marketing list.
 * A zero result with fabricated suggestions is a lie with better typography; this function
 * returns nothing when the response gave nothing.
 */
export interface RelatedCategory {
  readonly slug: string;
  readonly label: string;
  readonly count: number;
}

export function relatedCategories(
  facets: readonly SearchFacet[],
  selectedCategories: readonly string[],
  limit = 3,
): readonly RelatedCategory[] {
  const categoryFacet = facets.find((entry) => entry.name === 'category');
  if (categoryFacet === undefined) return [];
  return categoryFacet.values
    .filter((entry) => entry.count > 0 && !selectedCategories.includes(entry.value))
    .slice()
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit)
    .map((entry) => ({ slug: entry.value, label: categoryLabel(entry.value), count: entry.count }));
}
