/**
 * Headers: case-insensitive on the wire, one canonical shape in code, and a redaction list that is
 * applied before anything is kept for support.
 *
 * `fetchTransport` in transport.js already refuses to carry a response body or a URL into an error
 * message because a signed-URL response *is* the secret. The same reasoning applies to headers: a
 * support bundle that keeps `authorization` or a signed URL verbatim turns a helpful attachment
 * into a credential leak, so redaction here is the default and keeping a value is the exception.
 */

import type { HttpRequest } from './middleware.js';

export type HeaderBag = Readonly<Record<string, string>>;

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const REQUEST_ID_HEADER = 'x-request-id';
export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const AUTHORIZATION_HEADER = 'authorization';
export const SERVER_TIME_HEADER = 'date';

/**
 * Values with these names are never kept, logged, or handed to a `onBody` hook. Matched on the
 * lower-cased name.
 */
const SENSITIVE_EXACT: ReadonlySet<string> = new Set([
  AUTHORIZATION_HEADER,
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-api-key',
  'x-auth-token',
  'x-session-token',
]);

/** Substrings that mark a header name as carrying a credential or a signed URL. */
const SENSITIVE_PARTS: readonly string[] = ['token', 'secret', 'signature', 'authorization', 'cookie'];

export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function normalizeHeaders(input: HeaderBag | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (input === undefined) return out;
  for (const [name, value] of Object.entries(input)) {
    const key = normalizeName(name);
    if (key === '') continue;
    out[key] = value.trim();
  }
  return out;
}

export function getHeader(headers: HeaderBag | undefined, name: string): string | undefined {
  if (headers === undefined) return undefined;
  const key = normalizeName(name);
  for (const [candidate, value] of Object.entries(headers)) {
    if (normalizeName(candidate) === key) return value;
  }
  return undefined;
}

export function hasHeader(headers: HeaderBag | undefined, name: string): boolean {
  return getHeader(headers, name) !== undefined;
}

/** Immutable set: replaces any existing spelling of the same name. */
export function setHeader(headers: HeaderBag | undefined, name: string, value: string): Record<string, string> {
  const next = normalizeHeaders(headers);
  next[normalizeName(name)] = value;
  return next;
}

export function withoutHeader(headers: HeaderBag | undefined, name: string): Record<string, string> {
  const key = normalizeName(name);
  const next = normalizeHeaders(headers);
  delete next[key];
  return next;
}

export function isSensitiveHeader(name: string): boolean {
  const key = normalizeName(name);
  if (SENSITIVE_EXACT.has(key)) return true;
  return SENSITIVE_PARTS.some((part) => key.includes(part));
}

export const REDACTED = '[redacted]';

/** Every sensitive value replaced by `[redacted]`; non-sensitive headers pass through untouched. */
export function redactHeaders(headers: HeaderBag | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(normalizeHeaders(headers))) {
    out[name] = isSensitiveHeader(name) ? REDACTED : value;
  }
  return out;
}

/**
 * A request has an idempotency key when the header is present under any spelling — the same test
 * transport.js's `hasIdempotencyKey` makes, kept here so the middleware chain does not have to
 * rebuild a `TransportRequest` to ask the question.
 */
export function requestHasIdempotencyKey(request: HttpRequest): boolean {
  return hasHeader(request.headers, IDEMPOTENCY_KEY_HEADER);
}

/**
 * Signed-URL-ish query secrets appearing inside a body or a URL string: `sig`, `signature`,
 * `token`, `key`, `policy`, `expires`. media.js treats a signed URL as a session-scoped secret;
 * the support copy of a failed body must not be the one place it survives.
 */
const SECRET_PARAM_PATTERN = /([?&](?:sig|signature|token|access_token|key|policy|expires|k)\=)[^&#\s]*/gi;
const BEARER_PATTERN = /\b(bearer\s+)[A-Za-z0-9._~+/=-]+/gi;

export function redactSecrets(text: string): string {
  return text.replace(SECRET_PARAM_PATTERN, '$1[redacted]').replace(BEARER_PATTERN, '$1[redacted]');
}

/** Truncation marker is part of the string so a support reader cannot mistake it for the whole body. */
export interface PreservedBody {
  readonly text: string;
  readonly truncated: boolean;
  readonly byteLength: number;
}

export function preserveBody(text: string, limitBytes: number): PreservedBody {
  const redacted = redactSecrets(text);
  const byteLength = byteLengthOf(redacted);
  if (byteLength <= limitBytes) {
    return { text: redacted, truncated: false, byteLength };
  }
  // Cut on code points, not on bytes: half an emoji in a support ticket is worse than a marker.
  let taken = 0;
  let out = '';
  for (const char of redacted) {
    const size = byteLengthOf(char);
    if (taken + size > limitBytes) break;
    taken += size;
    out += char;
  }
  return { text: `${out}…[truncated ${byteLength - taken} bytes]`, truncated: true, byteLength };
}

export function byteLengthOf(text: string): number {
  return new TextEncoder().encode(text).length;
}
