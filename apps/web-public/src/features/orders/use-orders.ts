import { useCallback, useEffect, useRef, useState } from 'react';
import type { OrderRole, OrdersTransport } from './api/orders-transport.js';
import type { OrderRow } from './api/orders-transport.js';

/**
 * All order reads/writes go through the injected transport. Nothing here reads the client
 * clock for a money decision; where a deadline matters the row carries the server's instant
 * and `lib/window-validity.ts` does the rest.
 */

export type Load<T> = { readonly kind: 'loading' } | { readonly kind: 'failed'; readonly message: string } | { readonly kind: 'ready'; readonly data: T };

interface CancelState {
  readonly busy: boolean;
  readonly done: boolean;
  readonly outcome: 'cancelled' | 'refused' | 'failed' | null;
  readonly message: string | null;
}

const initialCancel: CancelState = { busy: false, done: false, outcome: null, message: null };

/**
 * The idempotency key is minted once per user intent, not per click: a double tap — or a retry
 * after a dropped response — must resolve to the same decision server-side. This is the same
 * intent-per-tap discipline `@nastech/api-client` uses for its mutating posts.
 */
export function createIntentKey(orderId: string, verb: 'cancel'): string {
  return `${verb}:${orderId}:${nextSeq(verb, orderId)}`;
}

const seq = new Map<string, number>();
function nextSeq(verb: string, orderId: string): number {
  const k = `${verb}:${orderId}`;
  const n = (seq.get(k) ?? 0) + 1;
  seq.set(k, n);
  return n;
}

/** Test hook: the intent counter is module state; suites must not inherit another's sequence. */
export function resetIntentSeqForTests(): void {
  seq.clear();
}

export function useOrders(transport: OrdersTransport, role: OrderRole) {
  const [load, setLoad] = useState<Load<readonly OrderRow[]>>({ kind: 'loading' });
  // Guards against a slow response for an earlier generation overwriting a newer one
  // (role switch mid-flight).
  const generation = useRef(0);

  const reload = useCallback(() => {
    const gen = ++generation.current;
    setLoad({ kind: 'loading' });
    transport
      .listOrders({ role })
      .then((orders) => {
        if (generation.current === gen) setLoad({ kind: 'ready', data: orders });
      })
      .catch((e: unknown) => {
        if (generation.current === gen) setLoad({ kind: 'failed', message: describeFailure(e) });
      });
  }, [transport, role]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { load, reload };
}

export function useOrder(transport: OrdersTransport, orderId: string) {
  const [load, setLoad] = useState<Load<OrderRow>>({ kind: 'loading' });
  const [version, setVersion] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    setLoad({ kind: 'loading' });
    transport
      .getOrder(orderId)
      .then((order) => {
        if (generation.current === gen) setLoad({ kind: 'ready', data: order });
      })
      .catch((e: unknown) => {
        if (generation.current === gen) setLoad({ kind: 'failed', message: describeFailure(e) });
      });
  }, [transport, orderId, version]);

  return { load, reload: () => setVersion((v) => v + 1) };
}

export function useCancelOrder(transport: OrdersTransport, orderId: string) {
  const [state, setState] = useState<CancelState>(initialCancel);
  // One key per mounted intent: reset() mints the next one, so "start over" is a NEW intent
  // and a stuck retry reuses the old key — exactly the split api-client's IdempotencyKeys draws.
  const keyRef = useRef<string>(createIntentKey(orderId, 'cancel'));

  const cancel = useCallback(async () => {
    if (state.busy || state.done) return; // the button itself is guarded, not just the server
    setState({ ...initialCancel, busy: true });
    try {
      const outcome = await transport.cancelOrder(orderId, keyRef.current);
      setState({
        busy: false,
        done: true,
        outcome: outcome.cancelled ? 'cancelled' : 'refused',
        message: outcome.cancelled ? 'Order cancelled.' : (outcome.reason ?? 'This order can no longer be cancelled here.'),
      });
      return outcome;
    } catch (e: unknown) {
      // Failure is NOT done: the same key replays safely against the server's decision.
      setState({ busy: false, done: false, outcome: 'failed', message: describeFailure(e) });
      return null;
    }
  }, [transport, orderId, state.busy, state.done]);

  const reset = useCallback(() => {
    keyRef.current = createIntentKey(orderId, 'cancel');
    setState(initialCancel);
  }, [orderId]);

  return { ...state, cancel, reset };
}

export function describeFailure(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'Something went wrong loading your orders. Try again.';
}
