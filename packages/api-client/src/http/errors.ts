/**
 * The two failure shapes of this layer, and the rule that neither of them ever rounds, coerces, or
 * nulls something the server sent badly.
 *
 * `HttpFailure` is a request that the server answered — with a status and a code we can name.
 * `ContractViolationError` is something else entirely: the client asked for a shape the contract
 * does not allow (a float in a cents field, an enum value outside the ladder, a body that is not
 * JSON where JSON was promised). Those are not user errors and they must not be dressed as one.
 * `errors.js` closed the taxonomy on purpose, and I do not own that file, so a contract violation
 * is deliberately *not* an `ApiError`: it escapes every `catch (ApiError)` in the app and lands in
 * the error boundary, which is where a wire-format disagreement belongs. Rendering it as
 * "some details you entered need to be fixed" would blame a buyer for our schema.
 *
 * Raw-body preservation is for support, and support copies leak. Everything kept here is redacted
 * and length-bounded at construction, so there is no path from "attach the body" to "attach the
 * signed URL".
 */

import { ApiError } from '../errors.js';
import type { ApiErrorKind } from '../errors.js';
import type { PreservedBody } from './headers.js';
import { preserveBody } from './headers.js';
import type { DomainErrorCode } from './status-map.js';
import { apiErrorKindFor, codeForStatus, isKnownDomainCode } from './status-map.js';

/** How much of a bad body we are willing to keep. Chosen to fit one support ticket, not a log ship. */
export const SUPPORT_BODY_LIMIT_BYTES = 4096;

/** One field-level problem reported by a 422, shaped for a form to put back on the input. */
export interface FieldViolation {
  readonly field: string;
  readonly code: string;
  readonly message: string;
}

export interface HttpFailureInit {
  readonly status: number;
  readonly code: DomainErrorCode;
  readonly requestId?: string;
  readonly retryAfterMs?: number;
  readonly violations?: readonly FieldViolation[];
  /** Already redacted and truncated by the time it reaches the constructor. */
  readonly body?: PreservedBody;
  /** The server's own `error.message`, kept for support. Never rendered, never in `message`. */
  readonly serverMessage?: string;
  readonly path: string;
  readonly method: string;
}

/**
 * `message` is the static per-kind copy from `errors.js` — the same string a component would show.
 * Nothing from the response joins it: a 4xx echo of a request body is how a PIN or a signed URL
 * ends up in a console.
 */
export class HttpFailure extends Error {
  readonly status: number;
  readonly code: DomainErrorCode;
  readonly requestId: string | undefined;
  readonly retryAfterMs: number | undefined;
  readonly violations: readonly FieldViolation[];
  readonly body: PreservedBody | undefined;
  readonly serverMessage: string | undefined;
  readonly path: string;
  readonly method: string;

  constructor(init: HttpFailureInit) {
    const kind = apiErrorKindFor(init.status, init.code);
    super(new ApiError({ kind, httpStatus: init.status }).message);
    this.name = 'HttpFailure';
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId;
    this.retryAfterMs = init.retryAfterMs;
    this.violations = init.violations ?? [];
    this.body = init.body;
    this.serverMessage = init.serverMessage;
    this.path = init.path;
    this.method = init.method;
  }

  toApiError(): ApiError {
    const kind = apiErrorKindFor(this.status, this.code);
    return new ApiError({
      kind,
      httpStatus: this.status,
      ...(this.retryAfterMs !== undefined ? { retryAfterMs: this.retryAfterMs } : {}),
    });
  }

  /** What a support form may send without a privacy review: identifiers only, never the body. */
  supportSummary(): Record<string, string | number | boolean> {
    return {
      name: this.name,
      status: this.status,
      code: this.code,
      method: this.method,
      path: this.path,
      requestId: this.requestId ?? 'none',
      hasBody: this.body !== undefined,
      bodyTruncated: this.body?.truncated ?? false,
    };
  }
}

export function isHttpFailure(value: unknown): value is HttpFailure {
  return value instanceof HttpFailure;
}

export type ContractViolationKind =
  /** A non-integer in a cents field. The one that would silently misstate money if rounded. */
  | 'money_precision'
  | 'out_of_range'
  | 'unknown_enum_value'
  | 'malformed_json'
  | 'unexpected_shape'
  | 'invalid_field_name'
  | 'unsupported_currency'
  | 'bad_timestamp'
  | 'invalid_query_value'
  /** A response that claims to be JSON and is not (an HTML error page from a proxy, usually). */
  | 'content_type_mismatch';

export interface ContractViolationInit {
  readonly kind: ContractViolationKind;
  /** Dotted path to the offending field, e.g. `items[3].price.cents`. */
  readonly field: string;
  readonly received: string;
  readonly expected: string;
  readonly requestId?: string;
}

export class ContractViolationError extends Error {
  readonly kind: ContractViolationKind;
  readonly field: string;
  readonly received: string;
  readonly expected: string;
  readonly requestId: string | undefined;

  constructor(init: ContractViolationInit) {
    // The offending *value* is described by its type, never printed: a cents field that turns out
    // to be a string could be anything the caller put there, including something sensitive.
    super(
      `NasTech sent a ${init.field} that does not match the contract (expected ${init.expected}, received ${init.received}).`,
    );
    this.name = 'ContractViolationError';
    this.kind = init.kind;
    this.field = init.field;
    this.received = init.received;
    this.expected = init.expected;
    this.requestId = init.requestId;
  }
}

export function isContractViolation(value: unknown): value is ContractViolationError {
  return value instanceof ContractViolationError;
}

export function contractViolation(
  kind: ContractViolationKind,
  field: string,
  received: unknown,
  expected: string,
  requestId?: string,
): ContractViolationError {
  return new ContractViolationError({
    kind,
    field,
    received: describeValue(received),
    expected,
    ...(requestId !== undefined ? { requestId } : {}),
  });
}

/** Type + magnitude, never content. `R1299.50 in a cents field` is a bug report; the number is not. */
export function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  const type = typeof value;
  if (type === 'number') {
    const n = value as number;
    if (Number.isNaN(n)) return 'NaN';
    if (!Number.isFinite(n)) return n > 0 ? 'Infinity' : '-Infinity';
    return Number.isInteger(n) ? `integer(${signOfMagnitude(n)})` : `float(${signOfMagnitude(n)})`;
  }
  return type;
}

function signOfMagnitude(n: number): string {
  if (n === 0) return '0';
  const digits = Math.abs(Math.trunc(n)).toString().length;
  return n < 0 ? `negative,${digits}digits` : `${digits}digits`;
}

/**
 * Normalise anything thrown by this layer into the two shapes above. `ApiError` from transport.js
 * (network/timeout) passes through unchanged so wave A's behaviour and copy stay authoritative;
 * a caller bug passes through untouched as well, because swallowing it is how a bug becomes a
 * mystery.
 */
export function normalizeFailure(error: unknown, meta: { path: string; method: string }): unknown {
  if (error instanceof HttpFailure || error instanceof ApiError || error instanceof ContractViolationError) {
    return error;
  }
  if (error instanceof Error && error.name === 'AbortError') {
    // A bare DOMException from fetch means somebody aborted a signal this layer does not own.
    return error;
  }
  return contractViolation('unexpected_shape', meta.path, errorName(error), 'a typed transport failure', undefined);
}

function errorName(value: unknown): string {
  if (value instanceof Error) return value.name;
  return describeValue(value);
}

/**
 * The failure the layer raises when it will not send a mutation it cannot make replay-safe. Not an
 * HttpFailure: nothing reached the server, and saying otherwise would put a phantom request id in
 * front of support.
 */
export function missingIdempotencyKey(path: string, method: string): HttpFailure {
  return new HttpFailure({
    status: 409,
    code: 'IDEMPOTENCY_KEY_REUSED',
    path,
    method,
  });
}

export function failureFromBody(status: number, raw: string, meta: {
  path: string;
  method: string;
  requestId?: string;
  retryAfterMs?: number;
  limitBytes?: number;
}): HttpFailure {
  const parsed = safeJsonParse(raw);
  const envelopeError = parsed !== undefined && isRecord(parsed) ? parsed['error'] : undefined;
  const code =
    envelopeError !== undefined && isRecord(envelopeError) && isKnownDomainCode(envelopeError['code'])
      ? envelopeError['code']
      : codeForStatus(status);

  const violations =
    envelopeError !== undefined && isRecord(envelopeError) ? readViolations(envelopeError['violations']) : [];

  const serverMessage =
    envelopeError !== undefined && isRecord(envelopeError) && typeof envelopeError['message'] === 'string'
      ? envelopeError['message']
      : undefined;

  return new HttpFailure({
    status,
    code,
    path: meta.path,
    method: meta.method,
    violations,
    body: preserveBody(raw, meta.limitBytes ?? SUPPORT_BODY_LIMIT_BYTES),
    ...(serverMessage !== undefined ? { serverMessage } : {}),
    ...(meta.requestId !== undefined ? { requestId: meta.requestId } : {}),
    ...(meta.retryAfterMs !== undefined ? { retryAfterMs: meta.retryAfterMs } : {}),
  });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function safeJsonParse(text: string): unknown | undefined {
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function readViolations(value: unknown): readonly FieldViolation[] {
  if (!Array.isArray(value)) return [];
  const out: FieldViolation[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const field = typeof entry['field'] === 'string' ? entry['field'] : 'unknown';
    const code = typeof entry['code'] === 'string' ? entry['code'] : 'UNSPECIFIED';
    const message = typeof entry['message'] === 'string' ? entry['message'] : '';
    out.push({ field, code, message });
  }
  return out;
}

export type { ApiErrorKind };
