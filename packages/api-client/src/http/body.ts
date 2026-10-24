/**
 * Request bodies: validate on the way out, parse defensively on the way in.
 *
 * The outbound check is the same cents rule the inbound check enforces, and for the same reason:
 * `POST /v1/orders` carries `buyerTotal`, and a body built by casting a computed rand value into a
 * `Money` would otherwise ship a float to a handler whose constructor takes `int $cents`. The
 * request never leaves the browser in that state.
 *
 * Inbound, the danger is the opposite: a body that is not JSON at all. A captive portal or an
 * nginx error page answered with 200 is the classic case, and `JSON.parse` throwing a SyntaxError
 * inside a React effect is how "your card failed" gets shown for a network that never reached us.
 */

import { contractViolation, isRecord, safeJsonParse } from './errors.js';
import { assertCentsIntegrity } from '../serializers/cents.js';

/** Refuse a pathological body before it costs a round trip. 256 KB is far above any form we post. */
export const MAX_BODY_BYTES = 256 * 1024;

export interface SerializedBody {
  readonly text: string;
  readonly byteLength: number;
}

/**
 * Serialize an outgoing body. `undefined` means "send no body and no content-type", which matters
 * for `DELETE` and for a `POST` with no payload — a stray `undefined` stringified as JSON would
 * make the handler reject the request as malformed.
 */
export function serializeBody(body: unknown, field = 'body'): SerializedBody | undefined {
  if (body === undefined) return undefined;
  assertCentsIntegrity(body, field);
  const text = stringifyStable(body);
  const byteLength = new TextEncoder().encode(text).length;
  if (byteLength > MAX_BODY_BYTES) {
    throw contractViolation('out_of_range', field, `${byteLength} bytes`, `a request body under ${MAX_BODY_BYTES} bytes`);
  }
  return { text, byteLength };
}

/**
 * Key order is sorted so that two builds of the same intent produce byte-identical bodies. An
 * idempotency key that covers a different payload than the first attempt is a server-side conflict
 * (`IDEMPOTENCY_KEY_REUSED`), and object key order is the kind of difference nobody sees in review.
 */
export function stringifyStable(value: unknown): string {
  return JSON.stringify(normalize(value)) ?? 'null';
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalize);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const entry = (value as Record<string, unknown>)[key];
    // `undefined` members are dropped rather than emitted as null: a PATCH that sends
    // `{ note: null }` clears a field, and that must be a decision, not a serialization artifact.
    if (entry === undefined) continue;
    out[key] = normalize(entry);
  }
  return out;
}

/** Parse a response body that is expected to be JSON, with a typed failure when it is not. */
export function parseJsonBody(text: string, path: string, requestId?: string): unknown {
  if (text === '') return undefined;
  const looksJson = text.trimStart().startsWith('{') || text.trimStart().startsWith('[');
  const parsed = safeJsonParse(text);
  if (parsed === undefined) {
    throw contractViolation(
      looksJson ? 'malformed_json' : 'content_type_mismatch',
      path,
      `${text.length} chars`,
      'a JSON document',
      requestId,
    );
  }
  assertCentsIntegrity(parsed, path);
  return parsed;
}

/**
 * A PATCH body helper: only the keys the caller actually changed. Sending a whole `OrderView` back
 * as a patch would carry `status` and `version` from a stale read, and `version` is exactly the
 * field the ledger checks for optimistic locking (`assert_order_version_monotonic`).
 */
export function diffBody<T extends Record<string, unknown>>(before: T, after: Partial<T>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    if (!isRecord(before) || !(key in before)) {
      out[key] = value;
      continue;
    }
    if (!deepEqual(before[key], value)) out[key] = value;
  }
  return out;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((entry, index) => deepEqual(entry, b[index]));
  }
  if (isRecord(a) && isRecord(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => key in b && deepEqual(a[key], b[key]));
  }
  return false;
}
