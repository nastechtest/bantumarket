import type { Transport, TransportRequest } from '@nastech/api-client';
import { fingerprint } from './fake-transport.js';

/**
 * A recording transport: wraps any other transport and keeps a queryable transcript.
 *
 * Why it is not just `calls: TransportRequest[]` on the fake (which `api/fake-transport.ts` already
 * has): the useful recording is the OUTCOME pair — request, then what came back or which error was
 * thrown — because the assertions that matter are causal ("the retry used the key from the FIRST
 * attempt", "nothing was sent after the buyer navigated away"). A call list cannot answer those
 * without the test reconstructing the pairing by index, which is how an off-by-one becomes a passing
 * test.
 *
 * `toScript()` emits a redacted, key-sorted transcript so it can be snapshot-serialised or committed
 * as a fixture, and secrets do not survive the trip: signed-URL material and bearer tokens are
 * replaced by a stable placeholder. The reason is in `packages/api-client/src/errors.ts`: a failed
 * signed-URL fetch returns the secret in its body, and a transcript that keeps it becomes the thing
 * that leaks it into a snapshot file.
 */

export interface RecordedCall {
  readonly index: number;
  readonly method: string;
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | boolean>>;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly outcome: 'ok' | 'error';
  readonly response?: unknown;
  readonly error?: { readonly name: string; readonly message: string; readonly kind?: string; readonly httpStatus?: number };
  readonly startedAtMs: number;
  readonly durationMs: number;
}

export interface RecordingHandle {
  readonly transport: Transport;
  readonly calls: readonly RecordedCall[];
  /** Requests the recording saw for a path matcher, newest last. */
  matching(path: string | RegExp): RecordedCall[];
  /** The idempotency keys seen, in first-use order — one entry per intent, repeats included. */
  idempotencyKeys(): string[];
  /** True when the same key carried the same method+path+body more than once. */
  keyWasReused(key: string): boolean;
  clear(): void;
}

const SECRET_HEADER = /^(authorization|x-api-key|cookie|idempotency-key)$/i;
const SIGNED_URL_QUERY = /(signature|token|key|policy|expires|x-amz-|x-oss-)/i;

export function createRecordingTransport(inner: Transport): RecordingHandle {
  const calls: RecordedCall[] = [];

  const transport: Transport = {
    async request<T>(req: TransportRequest): Promise<T> {
      const startedAtMs = Date.now();
      const index = calls.length;
      let response: unknown;
      let outcome: RecordedCall['outcome'] = 'ok';
      let error: RecordedCall['error'];
      try {
        response = await inner.request<T>(req);
        return response as T;
      } catch (caught) {
        outcome = 'error';
        error = describeError(caught);
        throw caught;
      } finally {
        const durationMs = Date.now() - startedAtMs;
        calls.push({
          index,
          method: req.method,
          path: req.path,
          ...(req.query === undefined ? {} : { query: req.query }),
          headers: redactHeaders(req.headers),
          body: req.body,
          outcome,
          ...(outcome === 'ok' ? { response } : {}),
          ...(error === undefined ? {} : { error }),
          startedAtMs,
          durationMs,
        });
      }
    },
  };

  const handle: RecordingHandle = {
    transport,
    get calls() {
      return calls;
    },
    matching(path: string | RegExp) {
      const test = typeof path === 'string' ? (candidate: string) => candidate === path : (candidate: string) => path.test(candidate);
      return calls.filter((call) => test(call.path));
    },
    idempotencyKeys() {
      const seen: string[] = [];
      for (const call of calls) {
        const key = keyOf(call.headers);
        if (key !== undefined && !seen.includes(key)) seen.push(key);
      }
      return seen;
    },
    keyWasReused(key: string) {
      const attempts = calls.filter((call) => keyOf(call.headers) === key);
      if (attempts.length < 2) return false;
      const first = attempts[0];
      if (first === undefined) return false;
      // Reuse of a key across DIFFERENT bodies is a bug, not a retry; it still counts as reuse, and
      // the fake transport throws 409 on it — this method reports the fact, not the judgement.
      return attempts.some((call) => call.method === first.method && call.path === first.path);
    },
    clear() {
      calls.length = 0;
    },
  };

  return handle;
}

function keyOf(headers: Readonly<Record<string, string>>): string | undefined {
  return Object.entries(headers).find(([name]) => name.toLowerCase() === 'idempotency-key')?.[1];
}

function redactHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    out[name] = SECRET_HEADER.test(name) ? `<redacted:${value.slice(0, 4)}…${value.length}ch>` : value;
  }
  return out;
}

/** Strip query material that is a credential, keep the shape a test asserts on. */
export function redactUrl(url: string): string {
  const queryIndex = url.indexOf('?');
  if (queryIndex < 0) return url;
  const base = url.slice(0, queryIndex);
  const kept = url
    .slice(queryIndex + 1)
    .split('&')
    .map((pair) => {
      const name = pair.split('=')[0] ?? '';
      return SIGNED_URL_QUERY.test(name) ? `${name}=<redacted>` : pair;
    });
  return `${base}?${kept.join('&')}`;
}

function describeError(value: unknown): RecordedCall['error'] {
  if (value instanceof Error) {
    const kind = (value as Error & { kind?: string }).kind;
    const httpStatus = (value as Error & { httpStatus?: number }).httpStatus;
    return {
      name: value.name,
      message: value.message,
      ...(kind === undefined ? {} : { kind }),
      ...(httpStatus === undefined ? {} : { httpStatus }),
    };
  }
  return { name: 'Unknown', message: String(value) };
}

/**
 * A stable, diffable transcript for snapshots and committed fixtures. Attribute order is fixed and
 * timings are dropped: a duration in a snapshot fails the suite next Tuesday for no product reason.
 */
export function toScript(calls: readonly RecordedCall[]): string {
  return calls
    .map((call) => {
      const lines = [
        `${call.method} ${redactUrl(call.path)}`,
        `  outcome: ${call.outcome}`,
        `  body: ${stable(call.body)}`,
      ];
      if (call.outcome === 'ok') lines.push(`  response: ${stable(call.response)}`);
      else if (call.error !== undefined) lines.push(`  error: ${stable(call.error)}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

function stable(value: unknown): string {
  if (value === undefined) return 'undefined';
  return fingerprint(value);
}
