/**
 * Console table preferences. They are per-browser, not per-account: density is a property of the
 * screen the operator is sitting at, and a shared desk changes it more often than a shared login.
 * Storage is injected so tests and private-mode browsers (where the setter throws) get the same
 * defaults instead of an exception in a render.
 */

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function browserStorage(): PreferenceStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export type Density = 'comfortable' | 'compact';

const DENSITY_KEY = 'nastech.staff.density.v1';

export function readDensity(storage: PreferenceStorage | null = browserStorage()): Density {
  return read(storage, DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable';
}

export function writeDensity(
  density: Density,
  storage: PreferenceStorage | null = browserStorage(),
): void {
  write(storage, DENSITY_KEY, density);
}

export function toggleDensity(density: Density): Density {
  return density === 'compact' ? 'comfortable' : 'compact';
}

/**
 * Bounded page sizes. The transport's cursor page size has its own hard maximum; this list is the
 * subset an operator may choose from, and it stops at 50 on purpose — a console table is read at a
 * desk, not scrolled like a feed.
 */
export const PAGE_SIZES = [25, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

const PAGE_SIZE_KEY = 'nastech.staff.page-size.v1';

export function readPageSize(storage: PreferenceStorage | null = browserStorage()): PageSize {
  const stored = Number(read(storage, PAGE_SIZE_KEY));
  return (PAGE_SIZES as readonly number[]).includes(stored) ? (stored as PageSize) : PAGE_SIZES[0];
}

export function writePageSize(
  size: PageSize,
  storage: PreferenceStorage | null = browserStorage(),
): void {
  write(storage, PAGE_SIZE_KEY, String(size));
}

function read(storage: PreferenceStorage | null, key: string): string | null {
  if (storage === null) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function write(storage: PreferenceStorage | null, key: string, value: string): void {
  if (storage === null) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Private mode or a quota error: the preference simply does not persist.
  }
}
