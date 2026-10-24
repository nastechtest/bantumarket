/**
 * Compression hint, and the size guard a browser will not do for us.
 *
 * WHY A HINT AT ALL. `Accept-Encoding` is a forbidden header name in `fetch`: a browser sets it from
 * its own build and silently drops whatever the page asked for. So this middleware does two things
 * instead of pretending. It mirrors the advertised set into `x-accept-content-encoding`, which an
 * edge or CDN in front of the (future) PHP router *can* read — that is what lets the platform choose
 * `zstd` for a 2 MB asset manifest on a 3G handset while leaving a browser-only path on gzip — and it
 * records the encoding the response actually arrived with, so `check:payload` has a number to read
 * instead of an assumption.
 *
 * THE SIZE GUARD. A gzip bomb is not a theoretical problem for a marketplace: the response we most
 * fear is a search page that 200s with an HTML error body from a captive portal, because that is the
 * path where a JSON parse of several megabytes happens inside a React effect. `fetch` has already
 * buffered by the time a client can read `Content-Length`, so this cannot stop the bytes arriving —
 * claiming otherwise would be a comment that lies. What it does stop is the *parse*, which is where
 * the memory and the main-thread stall actually are.
 *
 * `DEFAULT_MAX_JSON_BYTES` is a response guard, not a payload budget: the ceilings the project
 * measures (`packages/api-contracts` → `budgets`) are JS and model sizes and stay there. Re-declaring
 * one of those numbers here would give two sources of truth for the same limit.
 */

import type { Middleware, MiddlewareContext, Next, RawResponse } from '../middleware.js';
import { setHeader } from '../headers.js';
import { contractViolation } from '../errors.js';

export const SUPPORTED_ENCODINGS = ['gzip', 'x-gzip', 'deflate', 'br', 'zstd', 'identity'] as const;
export type SupportedEncoding = (typeof SUPPORTED_ENCODINGS)[number];

export const ACCEPT_ENCODING_HEADER = 'accept-encoding';
/** The readable-by-the-edge mirror of `accept-encoding`; the browser forbids the real one. */
export const CONTENT_ENCODING_HINT_HEADER = 'x-accept-content-encoding';
export const VARY_HINT_HEADER = 'x-vary-encoding';

export const DEFAULT_MAX_JSON_BYTES = 2 * 1024 * 1024;

export interface DecompressHintOptions {
  readonly advertise?: readonly SupportedEncoding[];
  readonly maxBytes?: number;
  /** Called with what the server actually sent, for a budget report or a dev overlay. */
  readonly onEncoding?: (info: EncodingReport) => void;
}

export interface EncodingReport {
  readonly path: string;
  readonly encoding: SupportedEncoding | 'unknown';
  readonly bytes: number;
  readonly hinted: string;
}

export function isSupportedEncoding(value: string): value is SupportedEncoding {
  return (SUPPORTED_ENCODINGS as readonly string[]).includes(value.toLowerCase());
}

export function decompressHintMiddleware(options: DecompressHintOptions = {}): Middleware {
  const advertised = options.advertise ?? ['gzip', 'br', 'zstd'];
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_JSON_BYTES;
  const hint = advertised.join(', ');

  return async function decompressHint(ctx: MiddlewareContext, next: Next): Promise<RawResponse> {
    const hinted = withRequest(ctx, hint);
    const response = await next(hinted);

    const encoding = normalizeEncoding(response.headers['content-encoding']);
    const bytes = byteLength(response.bodyText);

    if (bytes > maxBytes) {
      throw contractViolation(
        'out_of_range',
        response.path,
        `${bytes} bytes`,
        `a response body under ${maxBytes} bytes`,
        response.headers['x-request-id'],
      );
    }

    options.onEncoding?.({ path: response.path, encoding, bytes, hinted: hint });

    if (encoding === 'unknown' && response.headers['content-encoding'] !== undefined) {
      // An encoding this build cannot name has still been decoded (or not) by the platform, not by
      // us. Warn rather than fail: refusing a response the browser handled fine would be a client
      // bug dressed up as a server outage.
      ctx.services.warn(
        `NasTech responded with content-encoding "${response.headers['content-encoding']}", which this client did not advertise.`,
      );
    }

    return response;
  };
}

function withRequest(ctx: MiddlewareContext, hint: string): MiddlewareContext {
  let headers = setHeader(ctx.request.headers, CONTENT_ENCODING_HINT_HEADER, hint);
  // Sent for completeness; browsers drop it. A non-browser caller (the asset pipeline CLI) is the one
  // that actually honours it, which is why the code does not skip it.
  headers = setHeader(headers, ACCEPT_ENCODING_HEADER, hint);
  return { ...ctx, request: { ...ctx.request, headers } };
}

function normalizeEncoding(value: string | undefined): SupportedEncoding | 'unknown' {
  if (value === undefined || value.trim() === '') return 'identity';
  const first = value.split(',')[0]?.trim().toLowerCase();
  if (first === undefined) return 'identity';
  return isSupportedEncoding(first) ? first : 'unknown';
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
