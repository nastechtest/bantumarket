/**
 * Small, seller-facing text helpers. Money is not here on purpose: every amount goes through
 * `MoneyText` from `@nastech/design-system`, which owns integer-cent formatting.
 */

/** Two-letter avatar initials; a bullet rather than an empty box when no name has arrived. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '•';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

/**
 * The name the header greets with, or null. Null is information: the account menu falls back
 * to the neutral word "Seller" instead of inventing a first name or the word "there".
 */
export function firstNameOf(name: string): string | null {
  const first = name.trim().split(/\s+/).find(Boolean);
  return first === undefined ? null : first;
}

/** "1 listing", "2 listings", "0 listings" — the count always leads, so it cannot go missing. */
export function countOf(count: number, singular: string, plural?: string): string {
  const noun = count === 1 ? singular : (plural ?? `${singular}s`);
  return `${count} ${noun}`;
}

/** The document title for a resolved route; an unknown/empty label still names the app. */
export function documentTitleFor(routeLabel: string): string {
  const label = routeLabel.trim();
  return label === '' ? 'NasTech Market — Seller' : `${label} — NasTech Market Seller`;
}
