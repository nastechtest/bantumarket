/**
 * The middleware chain: one request in, one raw response out, and every cross-cutting rule
 * (deadline, retry, auth, request id, cache, encoding hint, cancellation) expressed as a function
 * rather than as a special case in a call site.
 *
 * The shape is deliberate. A middleware receives an immutable context and a `next` that it may call
 * zero, one, or many times, which is what lets `retry.ts` re-run everything downstream while
 * `auth.ts` runs exactly once per logical request. If instead each middleware mutated a shared
 * request, the retry loop would silently reuse the headers the previous attempt added — including a
 * per-attempt request id, which is the one thing that makes a support thread resolvable.
 *
 * Order is therefore part of the contract and is asserted in `client.ts`, not left to the caller:
 *   cache-control → auth → retry → request-id → timeouts → decompress-hint → terminal
 */

import type { HttpMethod } from '../transport.js';
import type { IntentId } from '../idempotency.js';
import type { AbortScope } from '../abort.js';
import { isQueryScalar, type QueryValue } from './query.js';

export type { HttpMethod };
export type { QueryValue, QueryScalar, QueryInput } from './query.js';

/** The request as it enters the chain. Everything a middleware may change is a new object here. */
export interface HttpRequest {
  readonly method: HttpMethod;
  /** Root-relative, no query, no base. Same convention as `TransportRequest.path`. */
  readonly path: string;
  readonly query?: Readonly<Record<string, QueryValue>>;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  /** Per-request deadline; falls back to the client default. */
  readonly timeoutMs?: number;
  /** Caller-owned cancellation (usually an `AbortScope.child().signal`). */
  readonly signal?: AbortSignal;
  /**
   * The intent this mutation belongs to. When present the client attaches the `Idempotency-Key`
   * from `idempotency.ts` for it — once, before the retry loop, so every attempt replays the same
   * key rather than minting a fresh one and turning a double tap into two orders.
   */
  readonly intent?: IntentId;
  /** Cache tags this successful mutation invalidates. */
  readonly invalidate?: readonly string[];
  /** Overrides the client's attempt budget for this request. `1` means never retry. */
  readonly attempts?: number;
}

/** A response as the transport saw it, before any envelope parsing. */
export interface RawResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: Readonly<Record<string, string>>;
  readonly bodyText: string;
  /** Carried through so an error can name the request without the caller rebuilding it. */
  readonly path: string;
  readonly method: HttpMethod;
}

/** Injected effects. Everything time- or randomness-related is here so tests are deterministic. */
export interface MiddlewareServices {
  readonly sleep: (ms: number) => Promise<void>;
  readonly rng: () => number;
  readonly now: () => number;
  readonly warn: (message: string) => void;
}

/** Resolved, validated client policy. Middleware reads it; nobody mutates it. */
export interface RequestPolicy {
  readonly timeoutMs: number;
  readonly attempts: number;
  readonly backoffBaseMs: number;
  readonly backoffCeilingMs: number;
  /** Total time one logical request may spend failing before the client gives up on it. */
  readonly retryBudgetMs: number;
  readonly retryAfterCeilingMs: number;
  readonly retryOnStatuses: readonly number[];
  readonly jitter: 'full' | 'equal';
}

export interface MiddlewareContext {
  readonly request: HttpRequest;
  /** 1 for the first attempt; incremented by the retry middleware. */
  readonly attempt: number;
  readonly policy: RequestPolicy;
  readonly services: MiddlewareServices;
  /** The scope whose cancellation owns this request (client scope or a per-page scope). */
  readonly scope: AbortScope;
}

export type Next = (ctx: MiddlewareContext) => Promise<RawResponse>;
export type Middleware = (ctx: MiddlewareContext, next: Next) => Promise<RawResponse>;

/**
 * Compose a chain around a terminal handler. An empty chain is legal and returns the terminal.
 * Each middleware is called with the `next` of the remainder, so a downstream middleware re-runs
 * for every `next()` call an upstream one makes.
 */
export function composeChain(chain: readonly Middleware[], terminal: Next): Next {
  if (chain.length === 0) return terminal;
  const head = chain[0] as Middleware;
  const nextOfRest = composeChain(chain.slice(1), terminal);
  return (ctx) => head(ctx, nextOfRest);
}

/** Immutably patch the request carried by a context. */
export function withRequest(ctx: MiddlewareContext, patch: Partial<HttpRequest>): MiddlewareContext {
  return { ...ctx, request: { ...ctx.request, ...patch } };
}

export function withAttempt(ctx: MiddlewareContext, attempt: number): MiddlewareContext {
  return { ...ctx, attempt };
}

export function isReplaySafe(request: HttpRequest, hasKey: boolean): boolean {
  // GET/HEAD are safe by definition; every other method only because the server can deduplicate it.
  return request.method === 'GET' || hasKey;
}

/**
 * The bridge to wave A. `TransportRequest.query` is scalar-only in `transport.ts` and I may not
 * re-signature it, so multi-value parameters are joined with `,` here and documented as a
 * limitation of the bridge: callers who need repeated query keys use `HttpClient.request` directly
 * (that path serialises arrays as repeated keys in `query.ts`).
 */
export function toTransportRequest(request: HttpRequest): import('../transport.js').TransportRequest {
  const query: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value === undefined || value === null) continue;
    query[key] = isQueryScalar(value) ? value : value.join(',');
  }
  return {
    method: request.method,
    path: request.path,
    ...(Object.keys(query).length > 0 ? { query } : {}),
    ...(request.body !== undefined ? { body: request.body } : {}),
    ...(request.headers !== undefined ? { headers: request.headers } : {}),
    ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
  };
}
