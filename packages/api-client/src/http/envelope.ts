/**
 * The single response shape for success and failure.
 *
 * ASSERTED, not observed: `nastech-market-php/README.md` says there is no router and no JSON layer,
 * so this is the shape the future layer will have to answer with. Two consequences are encoded here
 * rather than wished away.
 *
 * 1. Wave A keeps working. `media.js`, `catalogue.js` and `orders.js` already treat a transport
 *    response as the payload itself (`OrderView`, `SearchResponseWire`). An envelope is therefore
 *    recognised only when the body carries BOTH a `data` key and a `meta` key; a bare payload is
 *    passed through unchanged. A server that wraps works; a server that does not wrap does not
 *    silently get `undefined` handed to a caller typed as `Money`.
 * 2. There is a definite answer for the shape the server must not send. A 200 carrying an HTML error
 *    page, an empty body, a float in a cents field, or an unmapped status is a typed error that keeps
 *    the raw body for support. Never `null`: a `null` in a money field is indistinguishable from
 *    "this item is free", and the ledger's whole argument is that those are different facts.
 */

import { contractViolation, failureFromBody, isRecord, safeJsonParse } from './errors.js';
import { SERVER_TIME_HEADER, getHeader } from './headers.js';
import { REQUEST_ID_HEADER } from './headers.js';
import { assertCentsIntegrity } from '../serializers/cents.js';
import type { DomainErrorCode } from './status-map.js';
import { isKnownDomainCode } from './status-map.js';
import type { RawResponse } from './middleware.js';

export interface EnvelopeMeta {
  readonly requestId: string | undefined;
  /** Server clock as an epoch-ms instant, from `meta.server_time` or the transport `Date` header. */
  readonly serverTimeMs: number | undefined;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface EnvelopeSuccess<T> {
  readonly data: T;
  readonly meta: EnvelopeMeta;
}

const REQUEST_ID_KEYS = ['request_id', 'requestId'] as const;
const SERVER_TIME_KEYS = ['server_time', 'serverTime', 'now'] as const;

export function emptyMeta(): EnvelopeMeta {
  return { requestId: undefined, serverTimeMs: undefined, raw: {} };
}

function readMeta(meta: unknown, fallbackRequestId: string | undefined): EnvelopeMeta {
  if (!isRecord(meta)) return { ...emptyMeta(), requestId: fallbackRequestId };
  const requestId = readString(meta, REQUEST_ID_KEYS) ?? fallbackRequestId;
  const serverTime = readAny(meta, SERVER_TIME_KEYS);
  const serverTimeMs = typeof serverTime === 'string' ? numberOrNull(Date.parse(serverTime)) : typeof serverTime === 'number' ? serverTime : undefined;
  return { requestId, serverTimeMs, raw: meta };
}

function numberOrNull(value: number): number | undefined {
  return Number.isNaN(value) ? undefined : value;
}

/**
 * True when the body is an envelope rather than a bare payload: `data` AND `meta`.
 * Something with only one of them is treated as the payload, because a domain object that happens to
 * have a `data` field is far likelier than a server that sends half an envelope.
 */
export function isEnvelopeShape(body: unknown): body is { data: unknown; meta: unknown } {
  return isRecord(body) && 'data' in body && 'meta' in body;
}

/**
 * Parse a successful response. `data` is returned in wire shape; cents integrity is checked for the
 * whole document (that check throws rather than rounding), and enum/timestamp decoding stays with
 * the `serializers/` module that owns the contract vocabulary.
 */
export function parseSuccess<T>(response: RawResponse, fallbackRequestId?: string): EnvelopeSuccess<T> {
  const headerRequestId = getHeader(response.headers, REQUEST_ID_HEADER) ?? fallbackRequestId;

  if (response.status === 204) {
    return { data: undefined as T, meta: { ...emptyMeta(), requestId: headerRequestId } };
  }
  if (response.bodyText === '') {
    throw contractViolation('malformed_json', response.path, 'empty body', 'a JSON body, or a 204 with no content');
  }

  const parsed = safeJsonParse(response.bodyText);
  if (parsed === undefined) {
    throw contractViolation(
      'content_type_mismatch',
      response.path,
      `${response.bodyText.length} chars`,
      'JSON (an HTML error page from a proxy is the usual cause)',
    );
  }

  // The cents rule applies to everything this layer hands back, before any caller has a chance to
  // read a field: `12.5` in `price_cents` must fail here, not become R12.50 or R1250.00 downstream.
  assertCentsIntegrity(parsed, response.path);

  if (isEnvelopeShape(parsed)) return { data: parsed['data'] as T, meta: readMeta(parsed['meta'], headerRequestId) };

  // `{ data }` with no `meta` is what a hand-written handler produces when it forgets the envelope.
  // Unwrap it and leave `meta.raw` empty rather than inventing a request id.
  if (isRecord(parsed) && 'data' in parsed && !('error' in parsed)) {
    return { data: parsed['data'] as T, meta: { requestId: headerRequestId, serverTimeMs: undefined, raw: {} } };
  }

  return { data: parsed as T, meta: { requestId: headerRequestId, serverTimeMs: undefined, raw: {} } };
}

/**
 * Turn a non-2xx response into the one error type this layer raises for an answered request. The
 * body is kept (redacted, bounded) even when it is not JSON: an unmapped status with no body is a
 * support conversation, and an unmapped status with the body attached is a fix.
 */
export function parseFailure(response: RawResponse, retryAfterMs?: number): Error {
  const requestId = getHeader(response.headers, REQUEST_ID_HEADER);
  return failureFromBody(response.status, response.bodyText, {
    path: response.path,
    method: response.method,
    ...(requestId !== undefined ? { requestId } : {}),
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  });
}

/**
 * The server's own time, from wherever it is allowed to come: `meta.server_time` first — the
 * application clock a handover window is measured against — then the transport `Date` header.
 */
export function serverTimeMsOf(meta: EnvelopeMeta, response: RawResponse): number | undefined {
  if (meta.serverTimeMs !== undefined && Number.isFinite(meta.serverTimeMs)) return meta.serverTimeMs;
  const header = getHeader(response.headers, SERVER_TIME_HEADER);
  if (header === undefined) return undefined;
  const parsed = Date.parse(header);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * A success envelope that carries an outcome marker inside it. `PaymentRecordingResult` has
 * `accepted`, `duplicate` and `discrepancy` as honest 200s, and a client that reads only the status
 * line cannot tell a booked payment from one the ledger already had.
 */
export function outcomeCodeOf(data: unknown): DomainErrorCode | string | undefined {
  if (!isRecord(data)) return undefined;
  const code = data['code'] ?? data['status'];
  if (typeof code !== 'string' || code === '') return undefined;
  return isKnownDomainCode(code) ? code : code;
}

function readString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  const value = readAny(record, keys);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function readAny(record: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
}
