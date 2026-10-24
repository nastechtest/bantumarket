/**
 * Deterministic fake of the checkout wire, as a `Transport` — so feature code runs against the
 * SAME seam it will use in production (`createCheckoutApi(fetchTransport(...))` swaps in with no
 * call-site change), and every double-charge assertion is made on the transport boundary, not by
 * mocking the feature's own internals.
 *
 * The fake mirrors the PHP money path's structure, not its implementation:
 *   - `POST /payment-intents` is keyed by the `Idempotency-Key` header; a repeat of the SAME key
 *     returns the SAME intent and creates nothing new — the same "spent key" property the payout
 *     ledger gets from its unique index;
 *   - capture is asynchronous: the intent processing "succeeds server-side", then a webhook-style
 *     event applies `PAYMENT_RECORDED` via the REAL transition table (`nextOrderStatus` from
 *     api-client, which mirrors `Order::TRANSITIONS`). The only event that reaches PAID is
 *     PAYMENT_RECORDED, and this fake has no other path to PAID — matching `RecordProviderPayment`.
 *
 * The scenario knob `intentFirstResponseDelayMs` produces the brief's load-bearing case: the
 * server does the work, the CLIENT times out waiting for the response.
 *
 * Dev/demo data mirrors routes/Checkout.tsx's original placeholder (order ord_01 · Seiko
 * “Presage” · R4,200 · commission R420 at 10%, reversed on refund) — amounts hardcoded as the
 * server's issued facts; nothing here is computed from a rate.
 */

import { money } from '@nastech/api-contracts';
import type { Money } from '@nastech/api-contracts';
import { apiErrorFromStatus, nextOrderStatus } from '@nastech/api-client';
import type { OrderStatus, OrderView, Transport, TransportRequest } from '@nastech/api-client';
import type { CheckoutView, PaymentIntentResult, PaymentMethodId, PaymentIntentState } from './checkout-transport.js';

export interface CapturePlan {
  /** Capture succeeds server-side on first POST… */
  readonly capture: boolean;
  /** …but the HTTP response to that first POST arrives after this many ms (client "times out"). */
  readonly intentFirstResponseDelayMs: number;
  /** ms from intent-accepted until the simulated PAYMENT_RECORDED webhook books the order. */
  readonly webhookDelayMs: number;
  /** 'failed' makes the intent terminally declined — the only window where a new intent is legal. */
  readonly outcome: 'captured' | 'failed';
}

const DEFAULT_PLAN: CapturePlan = {
  capture: true,
  intentFirstResponseDelayMs: 0,
  webhookDelayMs: 10,
  outcome: 'captured',
};

interface FixtureOrder {
  status: OrderStatus;
  version: number;
  paidAt: string | null;
  itemPrice: Money;
  buyerTotal: Money;
  sellerId: string;
  buyerId: string;
  listingId: string;
  category: string;
  createdAt: string;
}

interface StoredIntent extends PaymentIntentResult {
  readonly orderId: string;
}

export interface FixtureBackend {
  readonly transport: Transport;
  /** Distinct idempotency keys that CREATED an intent — a second charge shows up here. */
  createdIntentKeys(): readonly string[];
  /** Every POST seen, with its key: proves whether a repeat carried the same key or a fresh one. */
  postLog(): readonly { readonly key: string; readonly created: boolean }[];
  statusOf(orderId: string): OrderStatus | null;
  /** Resolve after all queued webhook effects have applied. */
  settleAll(): Promise<void>;
  /** Seed a status directly — for tests about states the flow cannot produce itself yet. */
  seedStatus(orderId: string, status: OrderStatus): void;
  setPlan(plan: Partial<CapturePlan>): void;
}

function orderViewOf(id: string, o: FixtureOrder): OrderView {
  return {
    id,
    listingId: o.listingId,
    buyerId: o.buyerId,
    sellerId: o.sellerId,
    category: o.category,
    itemPrice: o.itemPrice,
    buyerTotal: o.buyerTotal,
    status: o.status,
    version: o.version,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    handoverConfirmedAt: null,
    completedAt: null,
    handoverTokenId: null,
  };
}

const ALL_METHODS: ReadonlyArray<CheckoutView['methods'][number]> = [
  {
    id: 'CARD',
    label: 'Card',
    blurb: 'Debit or credit, completed on your bank’s secure payment page.',
    chargeHappensOnProviderSurface: true,
  },
  {
    id: 'INSTANT_EFT',
    label: 'Instant EFT',
    blurb: 'Pay from your banking app — we send you a push to approve.',
    chargeHappensOnProviderSurface: true,
  },
  {
    id: 'CASH_ON_HANDOVER',
    label: 'Cash on handover',
    blurb: 'Pay the seller in cash when you meet. No online payment is taken now.',
    chargeHappensOnProviderSurface: false,
  },
];

export function createFixtureBackend(scenario: Partial<CapturePlan> = {}): FixtureBackend {
  const plan: CapturePlan = { ...DEFAULT_PLAN, ...scenario };
  const orders = new Map<string, FixtureOrder>();
  const intentsByKey = new Map<string, StoredIntent>();
  const lastIntentByOrder = new Map<string, StoredIntent>();
  const posts: { key: string; created: boolean }[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];

  const seed = (id: string, o: FixtureOrder) => {
    orders.set(id, o);
  };

  // ord_01: the placeholder's order — Seiko “Presage”, R4,200, no buyer-side fee.
  seed('ord_01', {
    status: 'AWAITING_PAYMENT',
    version: 1,
    paidAt: null,
    itemPrice: money(420_000),
    buyerTotal: money(420_000),
    sellerId: 'usr_seller_01',
    buyerId: 'usr_buyer_01',
    listingId: 'lst_01',
    category: 'pre-owned-watches',
    createdAt: '2026-02-11T08:00:00Z',
  });
  // ord_02: same watch at a lower price with an R89 buyer-borne delivery fee — proves the fee
  // rows and the total are the SERVER's numbers (420 000 → 318 900 + 8 900 = 327 800? no: see
  // buyerTotal below; the fee math here is fixture-side because the FIXTURE is the server).
  seed('ord_02', {
    status: 'AWAITING_PAYMENT',
    version: 1,
    paidAt: null,
    itemPrice: money(318_900),
    buyerTotal: money(327_800),
    sellerId: 'usr_seller_02',
    buyerId: 'usr_buyer_01',
    listingId: 'lst_02',
    category: 'pre-owned-watches',
    createdAt: '2026-02-11T09:30:00Z',
  });
  // ord_03: listing taken down — the ineligible path with a real reason.
  seed('ord_03', {
    status: 'AWAITING_PAYMENT',
    version: 1,
    paidAt: null,
    itemPrice: money(45_000),
    buyerTotal: money(45_000),
    sellerId: 'usr_seller_03',
    buyerId: 'usr_buyer_01',
    listingId: 'lst_sold',
    category: 'pre-owned-watches',
    createdAt: '2026-02-11T10:00:00Z',
  });
  // ord_04: a self-sale the ledger refused at creation — server-issued ineligibility.
  seed('ord_04', {
    status: 'AWAITING_PAYMENT',
    version: 1,
    paidAt: null,
    itemPrice: money(99_900),
    buyerTotal: money(99_900),
    sellerId: 'usr_buyer_01',
    buyerId: 'usr_buyer_01',
    listingId: 'lst_own',
    category: 'pre-owned-watches',
    createdAt: '2026-02-11T11:00:00Z',
  });
  // ord_05: tamper/stale-view case — buyerTotal below itemPrice; no honest ledger wrote this.
  seed('ord_05', {
    status: 'AWAITING_PAYMENT',
    version: 1,
    paidAt: null,
    itemPrice: money(310_000),
    buyerTotal: money(300_000),
    sellerId: 'usr_seller_05',
    buyerId: 'usr_buyer_01',
    listingId: 'lst_03',
    category: 'pre-owned-watches',
    createdAt: '2026-02-11T12:00:00Z',
  });
  // ord_06: already paid — checkout must show the TRUE state on arrival, not resume payment.
  seed('ord_06', {
    status: 'PAID',
    version: 2,
    paidAt: '2026-02-11T12:40:00Z',
    itemPrice: money(420_000),
    buyerTotal: money(420_000),
    sellerId: 'usr_seller_01',
    buyerId: 'usr_buyer_01',
    listingId: 'lst_01',
    category: 'pre-owned-watches',
    createdAt: '2026-02-11T12:30:00Z',
  });
  // ord_07: refund initiated but NOT settled — money has not moved.
  seed('ord_07', {
    status: 'REFUND_PENDING',
    version: 4,
    paidAt: '2026-02-01T08:00:00Z',
    itemPrice: money(420_000),
    buyerTotal: money(420_000),
    sellerId: 'usr_seller_01',
    buyerId: 'usr_buyer_01',
    listingId: 'lst_01',
    category: 'pre-owned-watches',
    createdAt: '2026-01-30T08:00:00Z',
  });

  function buildView(orderId: string): CheckoutView {
    const o = orders.get(orderId);
    if (o === undefined) throw apiErrorFromStatus(404);

    let ineligibility: CheckoutView['ineligibilityCode'] = null;
    let items: CheckoutView['items'] = [];
    let feeRows: CheckoutView['feeRows'] = [];
    let sellerCommission: CheckoutView['sellerCommission'] = null;

    if (orderId === 'ord_02') {
      items = [{ listingId: o.listingId, title: 'Citizen Eco-Drive titanium', unitPrice: o.itemPrice, quantity: 1 }];
      feeRows = [
        { id: 'fee_del_02', label: 'Insured delivery (JHB pilot)', amount: money(8_900), borneBy: 'buyer', includedInBuyerTotal: true },
      ];
      sellerCommission = {
        amount: money(31_890),
        rateLabel: '10%',
        note: 'Taken from the seller on completion, and reversed in full if the order is refunded.',
      };
    } else {
      items = [{ listingId: o.listingId, title: 'Seiko “Presage” automatic, 40.5 mm', unitPrice: o.itemPrice, quantity: 1 }];
      if (orderId !== 'ord_05') {
        feeRows = [];
        sellerCommission = {
          amount: money(42_000),
          rateLabel: '10%',
          note: 'Taken from the seller on completion, and reversed in full if the order is refunded.',
        };
      }
    }
    if (orderId === 'ord_05') {
      // inconsistent on purpose (buyerTotal < itemPrice); commission withheld — nothing here is priceable.
      feeRows = [];
      items = [{ listingId: o.listingId, title: 'Citizen Eco-Drive titanium (stale quote)', unitPrice: money(310_000), quantity: 1 }];
    }
    if (orderId === 'ord_03') ineligibility = 'LISTING_NOT_ACTIVE';
    if (orderId === 'ord_04') ineligibility = 'SELF_SALE';

    return {
      orderId,
      listingId: o.listingId,
      order: orderViewOf(orderId, o),
      items,
      feeRows,
      sellerCommission,
      methods: ALL_METHODS,
      ineligibilityCode: ineligibility,
      lastIntent: lastIntentByOrder.get(orderId) ?? null,
    };
  }

  function scheduleWebhook(orderId: string): void {
    timers.push(
      setTimeout(() => {
        const o = orders.get(orderId);
        if (o === undefined || o.status !== 'AWAITING_PAYMENT') return;
        // Only the transition table can move this order — the same discipline RecordProviderPayment
        // keeps (PAYMENT_RECORDED is the sole edge into PAID).
        const next = nextOrderStatus(o.status, 'PAYMENT_RECORDED');
        if (next === undefined) return;
        o.status = next;
        o.version += 1;
        o.paidAt = '2026-02-11T13:00:00Z';
      }, plan.webhookDelayMs),
    );
  }

  async function handle(req: TransportRequest): Promise<unknown> {
    const checkoutMatch = req.path.match(/^\/v1\/orders\/([^/]+)\/checkout$/);
    const intentsMatch = req.path.match(/^\/v1\/orders\/([^/]+)\/payment-intents$/);
    const orderMatch = req.path.match(/^\/v1\/orders\/([^/]+)$/);

    if (req.method === 'GET' && checkoutMatch !== null) {
      return buildView(decodeURIComponent(checkoutMatch[1]!));
    }
    if (req.method === 'GET' && orderMatch !== null) {
      const id = decodeURIComponent(orderMatch[1]!);
      const o = orders.get(id);
      if (o === undefined) throw apiErrorFromStatus(404);
      return orderViewOf(id, o);
    }
    if (req.method === 'POST' && intentsMatch !== null) {
      const orderId = decodeURIComponent(intentsMatch[1]!);
      const key = Object.entries(req.headers ?? {}).find(([name]) => name.toLowerCase() === 'idempotency-key')?.[1];
      if (key === undefined) throw apiErrorFromStatus(422); // the wire REQUIRES a keyed POST; no key, no intent
      const o = orders.get(orderId);
      if (o === undefined) throw apiErrorFromStatus(404);

      const seen = intentsByKey.get(key);
      if (seen !== undefined) {
        // Repeat of a spent key: return the SAME intent, create nothing. This is the whole
        // double-charge defence, server-side, in four lines.
        posts.push({ key, created: false });
        return { ...seen };
      }

      if (o.status !== 'AWAITING_PAYMENT') throw apiErrorFromStatus(409); // validation per errors.ts 409 mapping

      const body = (req.body ?? {}) as { method?: PaymentMethodId };
      const method = body.method ?? 'CARD';
      const state: PaymentIntentState =
        plan.outcome === 'failed' ? 'failed' : method === 'CASH_ON_HANDOVER' ? 'no_charge_required' : 'awaiting_provider';
      const intent: StoredIntent = {
        intentId: `pi_${intentsByKey.size + 1}`,
        idempotencyKey: key,
        state,
        amount: o.buyerTotal,
        method,
        providerReference: method === 'CASH_ON_HANDOVER' ? null : `PAYREF-${orderId.slice(-4)}-${String(intentsByKey.size + 1).padStart(3, '0')}`,
        failureReason: plan.outcome === 'failed' && method === 'CARD' ? 'card_declined' : plan.outcome === 'failed' ? 'eft_cancelled' : null,
        orderId,
      };
      intentsByKey.set(key, intent);
      lastIntentByOrder.set(orderId, intent);
      posts.push({ key, created: true });

      if (intent.state === 'awaiting_provider' && plan.capture) {
        // The server has done the work NOW; the buyer's browser may never see the answer.
        scheduleWebhook(orderId);
      }

      if (plan.intentFirstResponseDelayMs > 0 && posts.filter((p) => p.created).length === 1) {
        await new Promise((resolve) => setTimeout(resolve, plan.intentFirstResponseDelayMs));
      }
      const { orderId: _drop, ...wire } = intent;
      return wire;
    }
    throw apiErrorFromStatus(404);
  }

  return {
    transport: {
      request<T>(req: TransportRequest): Promise<T> {
        return handle(req) as Promise<T>;
      },
    },
    createdIntentKeys() {
      return [...intentsByKey.keys()].filter((k) => intentsByKey.get(k) !== undefined);
    },
    postLog() {
      return [...posts];
    },
    statusOf(orderId) {
      return orders.get(orderId)?.status ?? null;
    },
    async settleAll() {
      // Real-time drain of any queued webhook timers; tests that care about "webhook landed"
      // call this instead of sleeping a guessed amount.
      await new Promise<void>((resolve) => setTimeout(resolve, plan.webhookDelayMs + 10));
    },
    seedStatus(orderId, status) {
      const o = orders.get(orderId);
      if (o !== undefined) {
        o.status = status;
        o.version += 1;
      } else {
        seed(orderId, {
          status,
          version: 1,
          paidAt: null,
          itemPrice: money(420_000),
          buyerTotal: money(420_000),
          sellerId: 'usr_seller_01',
          buyerId: 'usr_buyer_01',
          listingId: 'lst_01',
          category: 'pre-owned-watches',
          createdAt: '2026-02-11T08:00:00Z',
        });
      }
    },
    setPlan(next) {
      Object.assign(plan, next);
    },
  };
}

/**
 * The transport the dev/demo app page talks to. There is NO HTTP layer yet (ADR 0002), so the
 * honest development state of this app is a deterministic in-memory ledger mirror — marked
 * CONTRACT-GAP where the page builds its API.
 */
export function devCheckoutTransport(): Transport {
  return createFixtureBackend().transport;
}
