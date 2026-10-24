/**
 * Payment-intent idempotency: one key per user intent, reused across every retry of that intent,
 * never carried across to a *different* intent.
 *
 * Division of labour with `@nastech/api-client/idempotency.ts`:
 *   - that package owns key minting and the intent→key map with the release discipline
 *     (release on settled/hard-invalid outcomes, KEEP on network/timeout — because the server may
 *     already have done the work under the key);
 *   - this module owns WHAT identifies "the same user intent" across the things React does to a
 *     checkout: a double click, a retry after a client timeout, a back-navigation, a full remount,
 *     even a browser death and return. The nonce that pins an intent lives in a store that
 *     outlives the component — a remount that minted a fresh key would turn "try again" into two
 *     captures, which is the exact money bug this checkout exists to prevent.
 *
 * A NEW intent (fresh key) happens in exactly one situation the server can vouch for: the ledger
 * reports the previous intent terminally FAILED (`state: 'failed'`, e.g. card declined — nothing
 * was captured), and the buyer deliberately pays again. Never on timeout, never on network error.
 */

import { generateIdempotencyKey, IdempotencyKeys } from '@nastech/api-client';
import type { IntentId } from '@nastech/api-client';

/**
 * The persisted record for one order's payment attempt: WHICH attempt (nonce) and the key it was
 * presented under. The key travels with the nonce because the remount guarantee is about the
 * STRING on the wire — a rebuilt registry that re-mints a fresh key for the same intent would
 * turn "the page came back" into a second capture, which is precisely the bug class this file
 * exists to kill. `key: null` means "this attempt was retired" (settled or hard-invalid), so the
 * next deliberate tap mints fresh.
 *
 * CONTRACT-GAP: `@nastech/forms` (and a shared session-store package) will own persistent
 * per-order UI state at integration; this local store is intentionally minimal and swap-ready.
 */
export interface IntentRecord {
  readonly nonce: number;
  readonly key: string | null;
}

export interface NonceStore {
  read(orderId: string): IntentRecord | null;
  write(orderId: string, record: IntentRecord): void;
  clear(orderId: string): void;
}

const NONCE_KEY_PREFIX = 'ntm-checkout-pay-nonce:';

export function createMemoryNonceStore(): NonceStore {
  const map = new Map<string, IntentRecord>();
  return {
    read: (orderId) => map.get(orderId) ?? null,
    write: (orderId, record) => {
      map.set(orderId, record);
    },
    clear: (orderId) => {
      map.delete(orderId);
    },
  };
}

function parseRecord(rawValue: string): IntentRecord | null {
  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const rec = parsed as { nonce?: unknown; key?: unknown };
    if (typeof rec.nonce !== 'number' || !Number.isInteger(rec.nonce) || rec.nonce < 0) return null;
    if (rec.key !== null && typeof rec.key !== 'string') return null;
    return { nonce: rec.nonce, key: (rec.key as string | null) ?? null };
  } catch {
    return null;
  }
}

/**
 * sessionStorage when a DOM exists (a remount and a back-navigation share one tab, so the intent
 * — nonce AND key — survives both — that is the point), memory when it does not (node-side tests,
 * SSR guards). Writes are wrapped: Safari private mode throws on setItem, and a throw here would
 * be a throw in the middle of a payment tap.
 */
export function createNonceStore(): NonceStore {
  const fallback = createMemoryNonceStore();
  const ss = sessionSafe();
  if (ss === null) return fallback;
  return {
    read(orderId) {
      try {
        const rawValue = ss.getItem(NONCE_KEY_PREFIX + orderId);
        if (rawValue === null) return fallback.read(orderId);
        return parseRecord(rawValue) ?? fallback.read(orderId);
      } catch {
        return fallback.read(orderId);
      }
    },
    write(orderId, record) {
      fallback.write(orderId, record);
      try {
        ss.setItem(NONCE_KEY_PREFIX + orderId, JSON.stringify(record));
      } catch {
        // Memory fallback already holds it for this page session; persistence is best-effort.
      }
    },
    clear(orderId) {
      fallback.clear(orderId);
      try {
        ss.removeItem(NONCE_KEY_PREFIX + orderId);
      } catch {
        /* best-effort */
      }
    },
  };
}

function sessionSafe(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    const ss = window.sessionStorage;
    return ss ?? null;
  } catch {
    return null;
  }
}

export function paymentIntentId(orderId: string, nonce: number): IntentId {
  return `pay:${orderId}:${nonce}`;
}

export class CheckoutIntents {
  private readonly keys = new IdempotencyKeys();
  private readonly store: NonceStore;
  private readonly initialNonce: number;

  constructor(options: { store?: NonceStore; initialNonce?: number } = {}) {
    this.store = options.store ?? createNonceStore();
    this.initialNonce = options.initialNonce ?? 0;
  }

  currentNonce(orderId: string): number {
    return this.store.read(orderId)?.nonce ?? this.initialNonce;
  }

  /**
   * The key for the payment the buyer is presenting NOW. First call for an intent mints and
   * persists; a double click, a retry after timeout, a back-navigation and a remount of the same
   * order all get the identical string back, because they are all the same intent.
   */
  keyForPayment(orderId: string): string {
    const persisted = this.store.read(orderId);
    const nonce = persisted?.nonce ?? this.initialNonce;
    const intent = paymentIntentId(orderId, nonce);
    if (persisted !== null && persisted.key !== null) {
      // The store, not this possibly-brand-new registry, is the authority on which string is
      // already in flight for this intent.
      this.keys.adopt(intent, persisted.key);
      return persisted.key;
    }
    const key = this.keys.keyForIntent(intent);
    this.store.write(orderId, { nonce, key });
    return key;
  }

  /**
   * The server reported the current intent terminally failed (nothing was captured — the webhook
   * that marks PAID can never fire for a failed intent). A deliberate "pay again" is then a NEW
   * intent and earns a fresh key. This is the ONLY way the nonce advances.
   */
  beginNewAttemptAfterConfirmedFailure(orderId: string): string {
    const next = this.currentNonce(orderId) + 1;
    const key = this.keys.keyForIntent(paymentIntentId(orderId, next));
    this.store.write(orderId, { nonce: next, key });
    return key;
  }

  /** The intent settled (captured, or cash no-charge): retire its key so nothing replays it. */
  settlePayment(orderId: string): void {
    const nonce = this.currentNonce(orderId);
    this.keys.releaseIntent(paymentIntentId(orderId, nonce));
    this.store.write(orderId, { nonce, key: null });
  }

  /** Hard-invalid request (validation/forbidden/notFound): same rule as orders.ts — never replay it. */
  releaseOnHardFailure(orderId: string): void {
    this.keys.releaseIntent(paymentIntentId(orderId, this.currentNonce(orderId)));
  }

  /** Test seam: forget persisted nonces for one order (a NEW browser session, effectively). */
  resetOrder(orderId: string): void {
    this.keys.releaseIntent(paymentIntentId(orderId, this.currentNonce(orderId)));
    this.store.clear(orderId);
  }

  pendingIntents(): readonly IntentId[] {
    return this.keys.pendingIntents();
  }
}

let shared: CheckoutIntents | null = null;

/**
 * The module-level registry the app page uses. Module-level is the feature: a route remount, a
 * back-navigation, or a re-render must NOT forget which intent the buyer already presented.
 */
export function defaultCheckoutIntents(): CheckoutIntents {
  if (shared === null) shared = new CheckoutIntents();
  return shared;
}
