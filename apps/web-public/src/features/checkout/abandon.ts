/**
 * Abandonment bookkeeping for a checkout the buyer walked away from (or whose browser died).
 *
 * The record is an *annotation*, never a verdict. It says "this device was mid-payment-intent on
 * this order"; what actually happened is decided by the transport on the next visit
 * (`resolvePhase` in state-machine.ts reads `OrderStatus` + `lastIntent`, not this file). A local
 * flag that claimed `paid` would be the bug this whole brief is built against.
 *
 * Stored in sessionStorage where available: same-tab back-navigation and remounts share it; a
 * different device or a new session simply re-reads the truth from the server, which is the
 * correct behaviour anyway.
 */

import type { CheckoutPhase } from './state-machine.js';

const PREFIX = 'ntm-checkout-abandon:';

export interface AbandonRecord {
  readonly orderId: string;
  /** The phase the flow was in when the buyer left. 'paying' is the one that matters. */
  readonly phaseAtExit: CheckoutPhase;
  readonly methodId: string | null;
  readonly leftAt: string;
}

export interface AbandonStore {
  remember(record: AbandonRecord): void;
  last(orderId: string): AbandonRecord | null;
  forget(orderId: string): void;
}

function safeSession(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

const memory = new Map<string, AbandonRecord>();

export function createAbandonStore(): AbandonStore {
  const ss = safeSession();
  return {
    remember(record) {
      memory.set(record.orderId, record);
      if (ss !== null) {
        try {
          ss.setItem(PREFIX + record.orderId, JSON.stringify(record));
        } catch {
          /* memory holds it for this page session */
        }
      }
    },
    last(orderId) {
      const local = memory.get(orderId);
      if (local !== undefined) return local;
      if (ss === null) return null;
      try {
        const rawValue = ss.getItem(PREFIX + orderId);
        if (rawValue === null) return null;
        const parsed = JSON.parse(rawValue) as unknown;
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          typeof (parsed as { orderId?: unknown }).orderId === 'string' &&
          typeof (parsed as { phaseAtExit?: unknown }).phaseAtExit === 'string'
        ) {
          return parsed as AbandonRecord;
        }
        return null;
      } catch {
        return null;
      }
    },
    forget(orderId) {
      memory.delete(orderId);
      if (ss !== null) {
        try {
          ss.removeItem(PREFIX + orderId);
        } catch {
          /* best-effort */
        }
      }
    },
  };
}

/** True when this device last saw the buyer mid-payment — the trigger for the "we may already have your money" banner. */
export function wasMidPayment(record: AbandonRecord | null): boolean {
  return record !== null && record.phaseAtExit === 'paying';
}

let sharedStore: AbandonStore | null = null;
export function defaultAbandonStore(): AbandonStore {
  if (sharedStore === null) sharedStore = createAbandonStore();
  return sharedStore;
}
