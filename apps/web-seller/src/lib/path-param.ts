/**
 * Reads one named parameter out of a concrete pathname using a route pattern such as
 * `/listings/:id/capture`. The router hands pages the pattern but not a match object, so detail
 * screens resolve their own id here and fail to a safe empty screen rather than guessing.
 */
export function pathParam(pattern: string, name: string, pathname: string): string | null {
  const clean = pathname.split(/[?#]/)[0] ?? '';
  const patternParts = pattern.split('/').filter((part) => part !== '');
  const pathParts = clean.split('/').filter((part) => part !== '');
  if (patternParts.length !== pathParts.length) return null;

  for (let index = 0; index < patternParts.length; index += 1) {
    const expected = patternParts[index];
    const actual = pathParts[index];
    if (expected === undefined || actual === undefined) return null;
    if (!expected.startsWith(':')) {
      if (expected !== actual) return null;
      continue;
    }
    if (expected.slice(1) !== name) continue;
    try {
      return decodeURIComponent(actual);
    } catch {
      return null;
    }
  }
  return null;
}
