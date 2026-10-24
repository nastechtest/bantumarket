/** `/listings/abc123` under `/listings` → `abc123`; a missing or empty segment is null. */
export function idFromPath(pathname: string, base: string): string | null {
  const path = pathname.split(/[?#]/)[0] ?? pathname;
  if (!path.startsWith(`${base}/`)) return null;
  const rest = path.slice(base.length + 1);
  if (!rest || rest.includes('/')) return null;
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

export function queryParam(search: string, key: string): string | null {
  const params = new URLSearchParams(search);
  return params.get(key);
}
