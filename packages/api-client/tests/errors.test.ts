import { describe, expect, it } from 'vitest';
import {
  ApiError,
  apiErrorFromStatus,
  errorKindFromStatus,
  isApiError,
  parseRetryAfter,
} from '../src/errors.js';
import { fetchTransport } from '../src/transport.js';

describe('error taxonomy mapping', () => {
  it('maps every status to the closed taxonomy', () => {
    expect(errorKindFromStatus(401)).toBe('unauthorized');
    expect(errorKindFromStatus(403)).toBe('forbidden');
    expect(errorKindFromStatus(404)).toBe('notFound');
    expect(errorKindFromStatus(409)).toBe('validation');
    expect(errorKindFromStatus(422)).toBe('validation');
    expect(errorKindFromStatus(429)).toBe('rateLimited');
    expect(errorKindFromStatus(500)).toBe('providerUnavailable');
    expect(errorKindFromStatus(502)).toBe('providerUnavailable');
    expect(errorKindFromStatus(504)).toBe('providerUnavailable');
  });

  it('429 carries a parsed Retry-After; nonsense and negatives carry none', () => {
    const limited = apiErrorFromStatus(429, '120');
    expect(limited.kind).toBe('rateLimited');
    expect(limited.retryAfterMs).toBe(120000);
    expect(limited.retryable).toBe(true);

    expect(parseRetryAfter('-5')).toBeUndefined();
    expect(parseRetryAfter('not-a-date')).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter('0')).toBe(0);

    const httpDate = new Date(Date.now() + 30_000).toUTCString();
    const after = parseRetryAfter(httpDate);
    expect(after).toBeGreaterThanOrEqual(0);
    expect(after).toBeLessThanOrEqual(31_000);
  });

  it('providerUnavailable says nothing was charged and never states what the provider saw', () => {
    const error = apiErrorFromStatus(503);
    expect(error.kind).toBe('providerUnavailable');
    // The copy may claim "try again"; it may not claim the payment succeeded, failed, or rolled
    // back, because a 503 in the money path proves none of that.
    expect(error.message.toLowerCase()).toContain('not responding');
    expect(error.message.toLowerCase()).not.toContain('failed');
    expect(error.retryable).toBe(true);
    expect(error.httpStatus).toBe(503);
  });

  it('messages are static per kind and never carry the status, url, or body', () => {
    const a = new ApiError({ kind: 'notFound' });
    const b = new ApiError({ kind: 'notFound', httpStatus: 404 });
    expect(a.message).toBe(b.message);
    expect(a.message).not.toContain('404');
    expect(isApiError(a)).toBe(true);
    expect(isApiError(new Error('x'))).toBe(false);
  });
});

describe('fetchTransport', () => {
  it('classifies a 429 response including Retry-After, without leaking the URL into the error', async () => {
    const transport = fetchTransport({
      baseUrl: 'https://api.example.internal',
      fetchImpl: (async () =>
        new Response('{"secret":"never-mind"}', {
          status: 429,
          headers: { 'retry-after': '30' },
        })) as typeof fetch,
    });

    let captured: unknown;
    try {
      await transport.request({ method: 'GET', path: '/v1/private-widget' });
    } catch (error) {
      captured = error;
    }
    expect(isApiError(captured)).toBe(true);
    const error = captured as ApiError;
    expect(error.kind).toBe('rateLimited');
    expect(error.retryAfterMs).toBe(30000);
    expect(error.message).not.toContain('api.example.internal');
    expect(error.message).not.toContain('never-mind');
  });

  it('passes a JSON body through on success and maps a hung connection to timeout', async () => {
    const transport = fetchTransport({
      baseUrl: 'https://api.example.internal',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })) as typeof fetch,
    });
    const got = await transport.request({ method: 'GET', path: '/v1/x' });
    expect(got).toEqual({ ok: true });

    const slow = fetchTransport({
      baseUrl: 'https://api.example.internal',
      timeoutMs: 5,
      // A stub fetch that honours AbortSignal, as a real fetch must.
      fetchImpl: ((_input: unknown, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          setTimeout(() => resolve(new Response('{}', { status: 200 })), 50);
        })) as unknown as typeof fetch,
    });
    let captured: unknown;
    try {
      await slow.request({ method: 'GET', path: '/v1/slow' });
    } catch (error) {
      captured = error;
    }
    expect(isApiError(captured)).toBe(true);
    expect((captured as ApiError).kind).toBe('timeout');
  });
});
