/**
 * The terminal: the only place in this layer that touches `fetch`.
 *
 * Everything above it is testable against an injected `HttpIo`, and that is deliberate — there is no
 * server to talk to (`nastech-market-php/README.md`: "No router, no controllers, no JSON, no status
 * codes"), so the alternative to an injectable boundary is a test suite that cannot run.
 *
 * Two rules carried over from `transport.ts` and not renegotiated:
 *   - an error never carries the URL. A signed-URL request's failure string includes the query, and
 *     the query is the secret.
 *   - an abort is classified, not swallowed. Our own deadline is a `timeout` `ApiError`; a scope
 *     cancellation is a `RequestAborted` that no failure counter may see. The distinction is read
 *     from the signal `abort.ts` stamped, not from `error.name`, because Bun, Chrome and Safari all
 *     report a cancellation slightly differently.
 */

import { ApiError } from '../errors.js';
import { RequestAborted, abortReasonOf, isTimeoutSignal } from '../abort.js';
import type { MiddlewareContext, Next, RawResponse } from './middleware.js';
import { joinUrl } from './query.js';
import { serializeBody } from './body.js';
import { normalizeHeaders } from './headers.js';

export interface IoInit {
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
}

export interface IoResult {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly bodyText: string;
}

/** The seam a test replaces. Returns a response *or rejects* — a rejection is classified below. */
export type HttpIo = (url: string, init: IoInit) => Promise<IoResult>;

export interface FetchTerminalOptions {
  readonly baseUrl: string;
  /** Defaults to `globalThis.fetch`, bound so a destructured `fetch` keeps its host object. */
  readonly io?: HttpIo;
  readonly fetchImpl?: typeof fetch;
}

export function browserIo(fetchImpl?: typeof fetch): HttpIo {
  const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis);
  return async (url, init) => {
    const response = await doFetch(url, {
      method: init.method,
      headers: { ...init.headers },
      ...(init.body !== undefined ? { body: init.body } : {}),
      ...(init.signal !== undefined ? { signal: init.signal } : {}),
    });
    const bodyText = response.status === 204 || response.status === 304 ? '' : await response.text();
    return { status: response.status, headers: collectHeaders(response.headers), bodyText };
  };
}

export function collectHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, name) => {
    out[name.toLowerCase()] = value;
  });
  return out;
}

export function headerValue(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  const key = name.toLowerCase();
  for (const [candidate, value] of Object.entries(headers)) {
    if (candidate.toLowerCase() === key) return value;
  }
  return undefined;
}

export function createFetchTerminal(options: FetchTerminalOptions): Next {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const io = options.io ?? browserIo(options.fetchImpl);

  return async function terminal(ctx: MiddlewareContext): Promise<RawResponse> {
    const { request } = ctx;
    const url = joinUrl(baseUrl, request.path, request.query);
    const body = serializeBody(request.body, 'body');

    const headers: Record<string, string> = {
      ...normalizeHeaders(request.headers),
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    };

    let result: IoResult;
    try {
      result = await io(url, {
        method: request.method,
        headers,
        ...(body !== undefined ? { body: body.text } : {}),
        ...(request.signal !== undefined ? { signal: request.signal } : {}),
      });
    } catch (error) {
      throw classifyThrown(error, request.signal, ctx);
    }

    return {
      status: result.status,
      // A 304 arrives `ok: false` from the platform, but the middleware chain never sends a
      // validator (`If-None-Match`), so this can only mean a proxy answered one unprompted. It is
      // surfaced as a failure by `envelope.parseFailure` rather than quietly treated as a hit.
      ok: result.status >= 200 && result.status < 300,
      headers: normalizeHeaders(result.headers),
      bodyText: result.bodyText,
      path: request.path,
      method: request.method,
    };
  };
}

/**
 * Turn whatever the I/O boundary threw into one of three honest outcomes. Order matters: an aborted
 * signal is checked *before* the error's own shape, because a platform that aborts mid-body reports
 * the same `TypeError: Failed to fetch` it uses for a dead connection.
 */
export function classifyThrown(error: unknown, signal: AbortSignal | undefined, ctx: MiddlewareContext): unknown {
  if (error instanceof RequestAborted || error instanceof ApiError) return error;

  const aborted = signal?.aborted === true || ctx.scope.signal.aborted;
  if (aborted) {
    if (isTimeoutSignal(signal) || (signal !== undefined && abortReasonOf(signal) === 'timeout')) {
      return new ApiError({ kind: 'timeout' });
    }
    const reason = abortReasonOf(signal) ?? abortReasonOf(ctx.scope.signal) ?? 'manual';
    return new RequestAborted(reason, ctx.scope.id);
  }

  // A caller-supplied `RequestAborted` from a scope this layer does not own stays a cancellation.
  if (error instanceof Error && error.name === 'AbortError') return new RequestAborted('manual', ctx.scope.id);

  return new ApiError({ kind: 'network' });
}
