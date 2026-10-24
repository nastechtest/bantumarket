import { PILOT_CATEGORIES, PILOT_LOCATIONS } from './types.js';

/**
 * Local, offline prefix suggestions over the pilot's own vocabulary — brands we expect buyers to
 * type and the category/location labels the facet UI uses. Deliberately no network: search
 * suggestions that hit the index turn a keystroke into a bill and fail loudly when the index is
 * down, which is exactly the confusion between "no matches" and "search failed" this feature is
 * built to prevent.
 */

const BRAND_TERMS = [
  'Seiko',
  'Seiko Presage',
  'Seiko 5',
  'Citizen',
  'Citizen Eco-Drive',
  'Casio',
  'Casio F-91W',
  'Swatch',
  'Tissot',
  'Orient',
  'Hamilton',
  'Omega',
  'chronograph',
  'automatic watch',
  'diver watch',
  'dress watch',
  'leather strap',
  'NATO strap',
];

export const SUGGESTION_SEEDS: readonly string[] = [
  ...BRAND_TERMS,
  ...Object.values(PILOT_CATEGORIES),
  ...Object.values(PILOT_LOCATIONS),
];

export function suggest(query: string, limit = 5): readonly string[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];
  const startsWith: string[] = [];
  const contains: string[] = [];
  const seen = new Set<string>();
  for (const seed of SUGGESTION_SEEDS) {
    const key = seed.toLowerCase();
    if (seen.has(key)) continue;
    if (key.startsWith(needle)) {
      seen.add(key);
      startsWith.push(seed);
    } else if (key.includes(needle)) {
      seen.add(key);
      contains.push(seed);
    }
  }
  startsWith.sort((a, b) => a.localeCompare(b));
  contains.sort((a, b) => a.localeCompare(b));
  return [...startsWith, ...contains].slice(0, limit);
}
