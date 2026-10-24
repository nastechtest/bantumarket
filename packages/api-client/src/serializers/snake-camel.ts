/**
 * snake_case wire ↔ camelCase domain, as a total function over keys.
 *
 * The wire really is snake_case: `db/migrations/001_money_path.sql` names its columns
 * `item_price_cents`, `buyer_total_cents`, `handover_confirmed_at`, `provider_event_id`, and
 * `HandoverToken::toArray()` emits exactly those strings with `array_key_exists` checks downstream
 * on `snake_case` keys (`src/Listings/Listing::fromRow`). The domain side is camelCase because that
 * is what `@nastech/api-contracts` declares (`categorySlug`, `sellerTier`, `bucketKey`).
 *
 * Why this is a function over the whole document rather than a per-field mapper: a per-field mapper
 * is a list, and a list is one new endpoint away from being wrong. Totality is the property — every
 * key converts, and `wireToDomain(domainToWire(x))` round-trips — so the failure mode of an unknown
 * field is "it passes through under a converted name", never "it silently vanished because nobody
 * added it to the map".
 *
 * Two deliberate limits:
 *   - free-form dictionaries (`filters`, `metadata`) are declared opaque. Renaming a key a user
 *     typed as a facet name would corrupt the user's own data, which is the one case where being
 *     total is the wrong property.
 *   - `__proto__` / `constructor` / `prototype` are dropped, not renamed. A key-naming walk over a
 *     JSON body is the classic prototype-pollution entry point, and a marketplace accepts JSON from
 *     sellers.
 */

const UNSAFE_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

export interface KeyMapOptions {
  /**
   * Keys whose *values* are free-form maps: converted at this level, then copied verbatim below it.
   * Defaults to the two the contract actually carries (`filters`, `metadata`).
   */
  readonly opaqueKeys?: readonly string[];
}

const DEFAULT_OPAQUE = ['filters', 'metadata'] as const;

export function snakeToCamel(name: string): string {
  if (!name.includes('_')) return name;
  return name.replace(/_([a-z0-9])/gi, (_match, char: string) => char.toUpperCase());
}

export function camelToSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-{2,}/g, '_')
    .toLowerCase();
}

/** The safe rename: an unsafe key returns undefined so the caller can skip it. */
export function safeKey(name: string): string | undefined {
  return UNSAFE_KEYS.has(name) ? undefined : name;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  // A Date, Map, or a class instance is not a wire object; copying it into a plain object would
  // silently destroy its behaviour.
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
}

/**
 * Wire (snake_case) to domain (camelCase), recursively. Domain keys that are already camelCase pass
 * through unchanged, which is what makes this safe to call on a payload a test fixture wrote by hand.
 */
export function wireToDomain<T = unknown>(value: unknown, options: KeyMapOptions = {}): T {
  return mapKeys(value, snakeToCamel, options.opaqueKeys ?? DEFAULT_OPAQUE, new WeakSet<object>()) as T;
}

/** Domain (camelCase) to wire (snake_case), recursively. */
export function domainToWire(value: unknown, options: KeyMapOptions = {}): unknown {
  return mapKeys(value, camelToSnake, options.opaqueKeys ?? DEFAULT_OPAQUE, new WeakSet<object>());
}

function mapKeys(
  value: unknown,
  rename: (name: string) => string,
  opaqueKeys: readonly string[],
  seen: WeakSet<object>,
): unknown {
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    if (seen.has(value)) return [];
    seen.add(value);
    return value.map((entry) => mapKeys(entry, rename, opaqueKeys, seen));
  }

  if (!isPlainObject(value)) return value;
  if (seen.has(value)) return {};
  seen.add(value);

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const safe = safeKey(key);
    if (safe === undefined) continue;
    const nextKey = rename(safe);
    const isOpaque =
      opaqueKeys.includes(safe) || opaqueKeys.includes(nextKey) || snakeToCamel(safe) === 'filters';
    out[nextKey] = isOpaque ? shallowCopy(entry) : mapKeys(entry, rename, opaqueKeys, seen);
  }
  return out;
}

/** An opaque map keeps its own keys but its *values* are still walked (a list inside `metadata`). */
function shallowCopy(value: unknown): unknown {
  if (Array.isArray(value)) return [...value];
  if (isPlainObject(value)) return { ...value };
  return value;
}

/**
 * Rename a flat object's keys with an explicit table — for the fields where a generated name would
 * be wrong rather than merely ugly (`serial_or_imei` → `serialOrImei` is fine; `has_3d` → `has3d`
 * is not, and `api-contracts` spells it `has3d`).
 */
export function applyFieldMap(
  value: Record<string, unknown>,
  table: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const safe = safeKey(key);
    if (safe === undefined) continue;
    const mapped = table[safe];
    out[mapped !== undefined ? mapped : snakeToCamel(safe)] = entry;
  }
  return out;
}

/**
 * `price_cents` + `currency` on the wire, one `Money` in the domain. The pairing is explicit because
 * guessing it — "some column ending in `_cents` shares a currency with the nearest column named
 * `currency`" — is exactly the sort of cleverness that misstates money when a second amount column
 * is added to the row.
 */
export interface MoneyColumns {
  readonly amountColumn: string;
  readonly currencyColumn?: string;
  readonly domainField: string;
}

export function columnsToMoney(
  row: Record<string, unknown>,
  column: MoneyColumns,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  const cents = out[column.amountColumn];
  delete out[column.amountColumn];
  const currency = column.currencyColumn === undefined ? 'ZAR' : out[column.currencyColumn];
  if (column.currencyColumn !== undefined) delete out[column.currencyColumn];
  out[column.domainField] = { cents, currency: typeof currency === 'string' ? currency : 'ZAR' };
  return out;
}

export const ROUND_TRIP_MAX_DEPTH = 16;

/** Totality check used by the test suite: a name that survives one pass survives both. */
export function isStableDomainKey(name: string): boolean {
  return camelToSnake(snakeToCamel(name)) === camelToSnake(name);
}
