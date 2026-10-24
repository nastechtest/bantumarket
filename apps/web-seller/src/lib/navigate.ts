/**
 * Internal-navigation helpers. Two jobs:
 *  1. Nothing from an untrusted string may become a browser destination. `returnTo` arrives
 *     from a URL, so it is sanitised here before the guard puts it in a redirect.
 *  2. The sign-in redirect is built in one place, so every critical route bounces identically.
 */

export const SIGN_IN_PATH = '/sign-in';

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

/** A path this app may navigate to, or `fallback`. Rejects absolute URLs and protocol-relative paths. */
export function internalPath(candidate: string | null | undefined, fallback = '/'): string {
  if (typeof candidate !== 'string') return fallback;
  const value = candidate.trim();
  if (value === '' || !value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (CONTROL_CHARACTERS.test(value)) return fallback;
  return value;
}

/** `/sign-in` with the blocked screen carried in `returnTo`; never points back at sign-in. */
export function signInHref(returnTo: string): string {
  const safe = internalPath(returnTo, '/');
  if (safe === SIGN_IN_PATH || safe.startsWith(`${SIGN_IN_PATH}?`) || safe.startsWith(`${SIGN_IN_PATH}#`)) {
    return SIGN_IN_PATH;
  }
  return `${SIGN_IN_PATH}?returnTo=${encodeURIComponent(safe)}`;
}

/** Reads `?returnTo=` from `location.search`. Returns null when the value is absent or not useful. */
export function returnToFromSearch(search: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const value = new URLSearchParams(query).get('returnTo');
  if (value === null) return null;

  const safe = internalPath(value, '/');
  if (safe === '/' || safe === SIGN_IN_PATH) return null;
  if (safe.startsWith(`${SIGN_IN_PATH}?`) || safe.startsWith(`${SIGN_IN_PATH}#`)) return null;
  return safe;
}
