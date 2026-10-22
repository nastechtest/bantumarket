/**
 * Deterministic fake for tests. It records every request exactly as the client built it —
 * headers included — so assertions run on captured calls rather than on the client's own
 * claims. Handlers are consumed in order; the final handler repeats, which keeps "fail once,
 * then succeed" scenarios a one-liner.
 */

import type { Transport, TransportRequest } from '../src/transport.js';

export type FakeHandler = (req: TransportRequest, callIndex: number) => unknown;

export class FakeTransport implements Transport {
  readonly calls: TransportRequest[] = [];
  private readonly handlers: FakeHandler[] = [];

  respond(handler: FakeHandler): this {
    this.handlers.push(handler);
    return this;
  }

  /** Every subsequent call rejects with this error (never resolves). */
  alwaysFailsWith(error: unknown): this {
    return this.respond(() => {
      throw error;
    });
  }

  /** Every subsequent call hangs — used to prove the client-side deadline fires. */
  alwaysHangs(): this {
    return this.respond(() => new Promise<never>(() => {}));
  }

  async request<T>(req: TransportRequest): Promise<T> {
    const index = this.calls.length;
    this.calls.push(req);
    const handler = this.handlers[Math.min(index, this.handlers.length - 1)];
    if (!handler) throw new Error('FakeTransport used with no handler configured');
    return handler(req, index) as T;
  }

  headersOf(index: number): Record<string, string> {
    const call = this.calls[index];
    if (!call) throw new Error(`no captured call at ${index}`);
    return { ...(call.headers ?? {}) };
  }

  idempotencyKeyOf(index: number): string | undefined {
    return this.headersOf(index)['Idempotency-Key'];
  }
}

export function listingSummaryFixture(id = 'lst_1') {
  return {
    id,
    title: 'Seiko 5 automatic',
    price: { cents: 320000, currency: 'ZAR' as const },
    categorySlug: 'watches',
    sellerTier: 'T3' as const,
    has3d: true,
    posterUrl: '/posters/lst_1.jpg',
  };
}

export function orderViewFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ord_1',
    listingId: 'lst_1',
    buyerId: 'usr_buyer',
    sellerId: 'usr_seller',
    category: 'watches',
    itemPrice: { cents: 320000, currency: 'ZAR' },
    buyerTotal: { cents: 352000, currency: 'ZAR' },
    status: 'AWAITING_PAYMENT',
    version: 1,
    createdAt: '2026-10-30T08:00:00+02:00',
    paidAt: null,
    handoverConfirmedAt: null,
    completedAt: null,
    handoverTokenId: null,
    ...overrides,
  };
}
