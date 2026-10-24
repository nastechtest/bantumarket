/**
 * PII detectors, used by `schema.ts` at emit time and by `no-pii.test.ts` over the whole catalogue.
 *
 * The posture this encodes, in one sentence: **every string this feature can send is a controlled
 * token** — an enum value, a slug, a route pattern, or a correlation ref — and none of those can
 * contain a space, an `@`, a URL scheme or a run of digits long enough to be a phone number, an ID
 * number, a card number or a bank account. Anything else is refused at the tracker, before the queue,
 * so a well-meaning feature cannot `track('listing_viewed', { title })` and turn analytics into a
 * copy of the listing.
 *
 * Why the rules are shaped like this and not a field-name blocklist:
 *  · POPIA s1 defines personal information broadly enough that a *value* can be personal even under
 *    an innocent name (`{ note: '082 555 0000' }`). Name checks alone miss that.
 *  · A free-text value can identify a person from the other side too: a listing title plus a category
 *    plus a city is a seller, and the exact price of a one-item listing is that seller's asking
 *    price — which is why `no-pii.test.ts` also asserts the price rule, not just the string rules.
 *  · Detectors here are pure and synchronous; nothing in this file reads the environment.
 */

/** Total digit runs we treat as identifier-shaped. 6 digits is a date; 7+ is a number a person owns. */
const MIN_DIGIT_RUN = 7;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const URL_RE = /[a-z][a-z0-9+.-]*:\/\/|\bwww\./i;
/** Signed-URL material: the query parameter *is* the secret, so its presence alone fails the check. */
const SIGNATURE_RE = /sig=|X-Amz-Signature|token=|auth=|key=/i;
const RAW_ENTITY_ID_RE = /^(?:lst|ast|ord|usr|user|mem|db|job|cap|txn|inv|dis)_[A-Za-z0-9-]+$/i;
/** Phone-ish: ZA mobile (0XX XXX XXXX / 27XX XXX XXXX) or any 11–13 digit national/international form. */
const PHONE_RE = /(?:^|[^0-9])(?:0|27)[\s.-]?[6-8][\d\s.-]{7,11}(?:[^0-9]|$)/;

export type PiiKind =
  | 'email'
  | 'phone'
  | 'national_id'
  | 'digit_run'
  | 'free_text'
  | 'raw_entity_id'
  | 'url_or_signed_url'
  | 'exact_price';

export interface PiiHit {
  readonly kind: PiiKind;
  readonly path: string;
  readonly why: string;
}

/**
 * South African ID numbers are 13 digits with a Luhn check (the same check as a card number, which is
 * why this also catches PANs). Verifying the checksum rather than just the length means the detector
 * says something true — and it keeps `2026-04-01T00:00:00.000Z`-era timestamps, which are 13 digits
 * *with* separators, out of the false-positive pile.
 */
export function isLuhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function isSouthAfricanIdNumber(value: string): boolean {
  const digits = value.replace(/[\s.-]/g, '');
  return /^\d{13}$/.test(digits) && isLuhnValid(digits);
}

export function digitRunLength(value: string): number {
  let best = 0;
  let current = 0;
  for (const ch of value) {
    if (ch >= '0' && ch <= '9') {
      current++;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return best;
}

export interface ScanOptions {
  /**
   * Skip the digit-run rule for values the schema has already proven to be correlation refs (exact
   * 24-character base32, leading letter). A ref is the one string in this system that is allowed to
   * look random-and-long, and a phone number is 10–12 digits, so the length check does the work and
   * the run check would only add a ~0.04 % chance of dropping a legal event.
   */
  readonly skipDigitRun?: boolean;
  /**
   * Skip the free-text rule. Only used for the two places where a space is legal by construction —
   * nothing uses it today, and `no-pii.test.ts` asserts that remains true of the catalogue.
   */
  readonly allowWhitespace?: boolean;
}

/**
 * One value, all rules. Returns every hit rather than the first, so an error message tells a
 * developer everything they did wrong in one pass instead of one complaint per rebuild.
 */
export function scanValue(path: string, value: unknown, opts: ScanOptions = {}): PiiHit[] {
  const hits: PiiHit[] = [];

  if (typeof value === 'string') {
    if (EMAIL_RE.test(value)) {
      hits.push({ kind: 'email', path, why: 'an email address is personal information under POPIA s1(1)(a)' });
    }
    if (isSouthAfricanIdNumber(value)) {
      hits.push({ kind: 'national_id', path, why: 'a 13-digit Luhn-valid number is a SA ID or a card number; both are special under POPIA s46' });
    }
    if (PHONE_RE.test(value)) {
      hits.push({ kind: 'phone', path, why: 'a South African mobile number identifies the person holding the handset' });
    }
    if (URL_RE.test(value) || SIGNATURE_RE.test(value)) {
      hits.push({ kind: 'url_or_signed_url', path, why: 'a URL can carry a path segment that is an id, and a signed URL carries the signature itself as the value' });
    }
    if (RAW_ENTITY_ID_RE.test(value)) {
      hits.push({ kind: 'raw_entity_id', path, why: 'a raw entity id ties a row to a named listing/order; send a session-scoped ref instead' });
    }
    if (looksLikeRandAmount(value)) {
      hits.push({ kind: 'exact_price', path, why: 'a formatted rand amount is an exact price, and the exact price of a one-item listing is that seller\'s asking price — send a bucket' });
    }
    if (!opts.allowWhitespace && /\s/.test(value.trim())) {
      hits.push({ kind: 'free_text', path, why: 'whitespace means prose, and prose is how a listing title, an address or a dispute story gets here' });
    }
    if (!opts.skipDigitRun && digitRunLength(value) >= MIN_DIGIT_RUN) {
      hits.push({ kind: 'digit_run', path, why: `${digitRunLength(value)} consecutive digits is identifier-shaped (phone, ID, PAN, account); nothing legal to send needs that` });
    }
  }

  if (value !== null && typeof value === 'object') {
    // Nested objects are how a feature "helpfully" passes the whole listing. They are never allowed:
    // an unbounded structure cannot be schema-asserted, and this is the hole every blocklist leaves.
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      hits.push(...scanValue(`${path}.${k}`, v, opts));
    }
  }
  if (Array.isArray(value)) {
    for (const [k, v] of Array.prototype.entries.call(value) as Iterable<[number, unknown]>) {
      hits.push(...scanValue(`${path}[${k}]`, v, opts));
    }
  }

  return hits;
}

/**
 * A rand-shaped amount in a string: `R2 700`, `R2,700.00`, `R450.00`. Features format money with
 * `@nastech/design-system`'s `formatZar`, so this is the realistic leak — a developer who already
 * has a formatted string on hand and thinks "surely a string is fine here".
 */
export function looksLikeRandAmount(value: string): boolean {
  return /(?:^|[^A-Za-z0-9])R\s?\d[\d\s,.-]{1,}\d(?:\.\d\d)?(?![\w])/.test(value) || /^(?:^|[^A-Za-z0-9])R\d{1,3}(\.\d\d)?(?![\d])/.test(value);
}


/**
 * Names that may never appear in an event's props, whatever their value. Kept as data so
 * `no-pii.test.ts` can assert the catalogue never declares one, and so a reviewer can read the list
 * as a statement of intent rather than infer it from absence.
 */
export const FORBIDDEN_PROPERTY_NAMES: readonly string[] = [
  'email', 'email_address', 'phone', 'phone_number', 'mobile', 'whatsapp', 'tel',
  'id_number', 'national_id', 'idbook', 'passport', 'tax_number', 'vat_number', 'sars',
  'bank_account', 'account_number', 'branch_code', 'card', 'pan', 'card_number', 'cvv', 'expiry',
  'name', 'full_name', 'first_name', 'surname', 'seller_name', 'buyer_name', 'contact_name', 'username', 'handle',
  'title', 'listing_title', 'description', 'notes', 'note', 'message', 'text', 'comment', 'caption', 'story',
  'query', 'q', 'search_term', 'search_query', 'suggest_text',
  'price', 'price_cents', 'amount', 'amount_cents', 'cents', 'rand', 'value_cents', 'commission_cents',
  'address', 'suburb', 'city', 'town', 'area', 'location', 'lat', 'lng', 'latitude', 'longitude', 'pin_code', 'pin',
  'listing_id', 'order_id', 'seller_id', 'buyer_id', 'user_id', 'member_id', 'asset_id', 'rendition_id', 'job_id',
  'bucket_key', 'signed_url', 'url', 'href', 'referrer', 'referer', 'user_agent', 'ua', 'ip', 'ip_address',
  'device_id', 'client_id', 'fingerprint', 'cookie_id', 'email_hash', 'phone_hash', 'jwt', 'token', 'session_token',
  'sha256', 'checksum', 'manifest',
];

/** Substrings that make a name PII-adjacent even when the exact name is not on the list above. */
const FORBIDDEN_NAME_FRAGMENTS: readonly string[] = [
  'email', 'phone', 'mobile', 'password', 'token', 'secret', 'signature', 'address', 'surname',
  'latitude', 'longitude', 'card', 'cvv', 'fingerprint', 'uuid_of', 'ssn',
];

/** Name-based check, applied to declared specs *and* to runtime payloads. */
export function isForbiddenName(name: string): { forbidden: true; via: 'exact' | 'fragment' } | { forbidden: false } {
  const lower = name.toLowerCase();
  if (FORBIDDEN_PROPERTY_NAMES.includes(lower)) return { forbidden: true, via: 'exact' };
  const fragment = FORBIDDEN_NAME_FRAGMENTS.find((f) => lower === f || lower.includes(f));
  if (fragment !== undefined) return { forbidden: true, via: 'fragment' };
  return { forbidden: false };
}

/**
 * Names that would mean "money" if a numeric prop were allowed to carry it. The catalogue may still
 * declare `price_bucket` (an enum of ranges) — this is what `no-pii.test.ts` uses to prove no event
 * can express an exact amount as a number, which is the other half of the price rule.
 */
export const MONEY_NAME_RE = /(cents|zar|rand|amount|price|cost|fee|commission|total|balance)/i;

export function isMoneyLikeName(name: string): boolean {
  return MONEY_NAME_RE.test(name.toLowerCase());
}

/**
 * Scan a whole props object: name rules first (they are the cheap, total check), then value rules.
 * `price_cents` under a bucket name is still an exact price, so the two layers are not redundant.
 */
export function scanProps(props: Readonly<Record<string, unknown>>, refs: readonly string[] = []): PiiHit[] {
  const hits: PiiHit[] = [];
  const refSet = new Set(refs);
  for (const [name, value] of Object.entries(props)) {
    const verdict = isForbiddenName(name);
    if (verdict.forbidden) {
      hits.push({
        kind: 'free_text',
        path: name,
        why: `property name "${name}" is on the forbidden list (${verdict.via} match) — a field with that name has no lawful place in an event`,
      });
      continue;
    }
    hits.push(...scanValue(name, value, refSet.has(name) ? { skipDigitRun: true } : {}));
  }
  return hits;
}

/**
 * The bucket ladder used wherever a funnel needs money. Edges are in cents, the same unit `Money`
 * uses, and the R2 700 line is a bucket edge on purpose: that is the break-even for a capture, so the
 * analytics can answer "did 3D-bearing items clear their capture cost" without a single exact price
 * ever leaving the device.
 *
 * CONTRACT-GAP: the edge equals `BREAK_EVEN_CENTS` from `tooling/asset-pipeline/intake-receipt.ts`
 * (R270 capture cost at a 10 % take rate). That module imports `node:crypto`, so it cannot be
 * bundled into a browser app; the number is mirrored here and belongs in `@nastech/api-contracts`
 * next to `budgets`, which is where the controller should promote it.
 */
export const PRICE_BUCKET_EDGES_CENTS: readonly number[] = [50_000, 100_000, 200_000, 270_000, 500_000, 1_000_000];

export const PRICE_BUCKETS = ['under_500', '500_1000', '1000_2000', '2000_2700', '2700_5000', '5000_10000', 'over_10000'] as const;
export type PriceBucket = (typeof PRICE_BUCKETS)[number];

/** Bucket a `Money`. Callers never see the cents after this returns, which is the point. */
export function bucketPrice(cents: number): PriceBucket {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new TypeError(`bucketPrice: expected whole non-negative cents, got ${cents}`);
  }
  const idx = PRICE_BUCKET_EDGES_CENTS.findIndex((edge) => cents < edge);
  return idx === -1 ? PRICE_BUCKETS[PRICE_BUCKETS.length - 1] as PriceBucket : PRICE_BUCKETS[idx] as PriceBucket;
}

/** How much of the price distribution the analytics can actually see: the bucket list, and nothing else. */
export const PRICE_RESOLUTION_LOST_ZAR = 'Each bucket is at least R500 wide below the break-even line and R1 000 wide above it.';
