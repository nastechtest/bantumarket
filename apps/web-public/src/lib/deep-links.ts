/**
 * Deep links: `nastech://item/lst_01` <-> `/item/lst_01`.
 *
 * The parser is hand-rolled and hostile by default, because a deep link is attacker-controlled
 * input that ends up in an address bar. Rules: exact scheme, segments from a conservative
 * charset only (no `..`, no backslash, no control characters, no embedded `//`), and a *web*
 * path may only be built from segments that could be our own routes — never from the link's
 * "host", which is where `nastech://evil.com/x` style payloads hide.
 */

export const DEEP_LINK_SCHEME = 'nastech';

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const SAFE_QUERY_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;

export interface ParsedDeepLink {
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
}

export function parseDeepLink(link: string): ParsedDeepLink | null {
  const prefix = `${DEEP_LINK_SCHEME}://`;
  if (!link.startsWith(prefix)) return null;
  const rest = link.slice(prefix.length);
  if (rest.length === 0 || rest.length > 2048) return null;

  const [pathPart, queryPart] = rest.split('?');
  if (rest.includes('#')) return null; // fragments on a deep link are a redirect smell; refuse
  if (pathPart === undefined || pathPart === '' || pathPart.startsWith('/')) return null;

  const segments = pathPart.split('/');
  for (const seg of segments) {
    if (!SAFE_SEGMENT.test(seg)) return null;
  }

  const query: Record<string, string> = {};
  if (queryPart !== undefined && queryPart !== '') {
    for (const pair of queryPart.split('&')) {
      const eq = pair.indexOf('=');
      const rawKey = eq === -1 ? pair : pair.slice(0, eq);
      const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
      if (!SAFE_QUERY_KEY.test(rawKey)) return null;
      if (valueHasControl(rawValue)) return null;
      if (rawKey in query) return null; // duplicate keys are someone trying something
      query[rawKey] = decodePercent(rawValue);
    }
  }
  return { path: `/${segments.join('/')}`, query };
}

export function webPathToDeepLink(path: string): string | null {
  if (!isSafeWebPath(path)) return null;
  return `${DEEP_LINK_SCHEME}://${path.slice(1)}`;
}

/** `/seg/seg?k=v` built only from the same conservative grammar parseDeepLink accepts. */
export function isSafeWebPath(path: string): boolean {
  if (!path.startsWith('/') || path.length === 1 || path.length > 2048) return false;
  if (path.includes('#') || path.includes('//')) return false;
  const [pathPart, queryPart] = path.slice(1).split('?');
  if (pathPart === undefined || pathPart === '') return false;
  for (const seg of pathPart.split('/')) {
    if (!SAFE_SEGMENT.test(seg)) return false;
  }
  if (queryPart !== undefined && queryPart !== '') {
    for (const pair of queryPart.split('&')) {
      const eq = pair.indexOf('=');
      const key = eq === -1 ? pair : pair.slice(0, eq);
      const value = eq === -1 ? '' : pair.slice(eq + 1);
      if (!SAFE_QUERY_KEY.test(key) || valueHasControl(value)) return false;
    }
  }
  return true;
}

function valueHasControl(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\u007f]/.test(value);
}

/** `decodeURIComponent` throws on malformed escapes (`%zz`); raw text is the honest fallback —
 *  it renders, it does not execute. */
function decodePercent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
