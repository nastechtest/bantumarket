/**
 * The checkout session: one core (`createCheckoutSession`) with the React hook as a thin shell.
 *
 * The core is framework-free on purpose: the double-charge guarantee is a property of THIS logic
 * (reentry lock + idempotency key + server-truth resolver), and it must be testable without a DOM
 * so no test can blame jsdom for a money bug.
 *
 * The invariant, stated where the code enforces it:
 *   - `pay()` fires at most ONE in-flight POST per order at a time (reentry lock, synchronous —
 *     a double click's second call is rejected before any await boundary);
 *   - every POST for the same user intent carries the SAME `Idempotency-Key` (idempotency.ts),
 *     so a retry after a client timeout, a back-navigation re-submit, and a remount re-submit all
 *     collapse to one intent server-side;
 *   - the only way to a NEW key is the server reporting the current intent terminally FAILED
 *     (`beginNewAttemptAfterConfirmedFailure`);
 *   - any question of the form "did I pay?" is answered from `CheckoutView` (transport), never
 *     from `phase`/local flags — `phase` only says where the BUYER is standing, not where the
 *     money is.
 */

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { CheckoutApi, CheckoutApiOptions, CheckoutView, PaymentIntentResult } from './api/checkout-transport.js';
import { createCheckoutApi } from './api/checkout-transport.js';
import { devCheckoutTransport } from './api/fixtures.js';
import type { PaymentMethodId } from './api/checkout-transport.js';
import { classifyCheckoutError } from './error-taxonomy.js';
import type { CheckoutErrorView } from './error-taxonomy.js';
import { defaultCheckoutIntents } from './idempotency.js';
import type { CheckoutIntents } from './idempotency.js';
import { defaultAbandonStore } from './abandon.js';
import type { AbandonStore } from './abandon.js';
import { isOpenForPayment, resolvePhase } from './state-machine.js';
import type { CheckoutPhase } from './state-machine.js';
import { deriveIneligibility, ineligibilityCopy } from './guards/ineligible-listing.js';

export interface CheckoutSessionState {
  readonly phase: CheckoutPhase;
  readonly orderId: string | null;
  readonly view: CheckoutView | null;
  readonly methodId: PaymentMethodId | null;
  readonly error: CheckoutErrorView | null;
  /** The buyer left mid-payment on this device and came back; renders the "may already be with us" banner. */
  readonly returnedFromAbandon: boolean;
  /** Last intent WE presented or the server reported for us — display only; truth is `view.lastIntent`. */
  readonly intent: PaymentIntentResult | null;
  /** Increments per deliberate user re-POST that the server confirmed as a NEW intent. */
  readonly attemptNonce: number;
}

export interface PayOutcome {
  readonly sent: boolean;
  readonly reason: 'ok' | 'not-confirmable' | 'in-flight' | 'no-method';
}

export interface CheckoutSessionOptions {
  readonly api: CheckoutApi;
  readonly intents: CheckoutIntents;
  readonly abandon?: AbandonStore;
  /** >0 turns on server-polling while `resolving`; 0 (default in tests) means recheck is manual. */
  readonly pollMs?: number;
  readonly maxPolls?: number;
}

export interface CheckoutSession {
  state(): CheckoutSessionState;
  subscribe(listener: () => void): () => void;
  load(orderId: string): Promise<void>;
  goReview(): void;
  goMethod(): void;
  chooseMethod(methodId: PaymentMethodId): void;
  back(): void;
  pay(): Promise<PayOutcome>;
  /** The resolving screen's "check again": a GET, safe, and the ONLY automatic-looking action. */
  recheck(): Promise<void>;
  /** Only legal after the server says the intent FAILED; mints a fresh key for a fresh intent. */
  payAgainAfterFailure(): Promise<PayOutcome>;
  markAbandoned(): void;
  dispose(): void;
}

const INITIAL: CheckoutSessionState = {
  phase: 'idle',
  orderId: null,
  view: null,
  methodId: null,
  error: null,
  returnedFromAbandon: false,
  intent: null,
  attemptNonce: 0,
};

export function createCheckoutSession(options: CheckoutSessionOptions): CheckoutSession {
  const { api, intents } = options;
  const abandon = options.abandon ?? defaultAbandonStore();
  const pollMs = options.pollMs ?? 0;
  const maxPolls = options.maxPolls ?? 0;

  let state: CheckoutSessionState = INITIAL;
  const listeners = new Set<() => void>();
  /** Synchronous reentry lock: the second tap of a double-click sees this BEFORE any await. */
  let inFlightPay = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let pollsUsed = 0;
  let disposed = false;

  function set(patch: Partial<CheckoutSessionState>): void {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }

  function stopPolling(): void {
    if (pollTimer !== undefined) {
      clearTimeout(pollTimer);
      pollTimer = undefined;
    }
  }

  function schedulePoll(): void {
    if (pollMs <= 0 || maxPolls <= 0 || disposed) return;
    if (pollsUsed >= maxPolls) return;
    stopPolling();
    pollsUsed += 1;
    pollTimer = setTimeout(() => {
      void recheck();
    }, pollMs);
  }

  /**
   * The server-truth mapper: phase ALWAYS comes from `CheckoutView.order.status` +
   * `view.lastIntent` + guards. Local memory cannot push the UI into "paid", and a stale local
   * "we timed out" cannot hold it in resolving once the webhook booked PAID.
   */
  function applyView(view: CheckoutView, previous: CheckoutSessionState): CheckoutSessionState['phase'] {
    const ineligible = deriveIneligibility(view);
    if (view.ineligibilityCode !== null || ineligible !== null) {
      stopPolling();
      return 'unavailable';
    }
    const phase = resolvePhase(view.order.status, view.lastIntent);
    if (phase === 'resolving') schedulePoll();
    else stopPolling();
    // Mid-flow, the buyer's own position wins over "review" ONLY while the order still accepts
    // payment; any non-review phase from the resolver (resolving/outcome) is server truth and wins.
    if (phase === 'review') {
      if (previous.phase === 'method' || previous.phase === 'confirm') return previous.phase;
      return 'review';
    }
    if (phase === 'resolving' && (previous.phase === 'paying' || previous.phase === 'confirm')) {
      return 'resolving';
    }
    return phase;
  }

  async function load(orderId: string): Promise<void> {
    set({ orderId, phase: 'loading', error: null });
    try {
      const view = await api.getView(orderId);
      const previous = state;
      const phase = applyView(view, previous);
      const returned = phase === 'resolving' && abandon.last(orderId) !== null;
      if (view.order.status !== 'AWAITING_PAYMENT') abandon.forget(orderId);
      set({
        view,
        phase,
        returnedFromAbandon: returned || previous.returnedFromAbandon,
        intent: view.lastIntent,
      });
    } catch (error) {
      set({ phase: 'error', error: classifyCheckoutError(error, 'load') });
    }
  }

  /** Re-read the truth. A GET: always safe, never a second intent, never a guess. */
  async function recheck(): Promise<void> {
    if (state.orderId === null) return;
    try {
      const view = await api.getView(state.orderId);
      const previous = state;
      const phase = applyView(view, previous);
      set({ view, phase, error: null, intent: view.lastIntent ?? previous.intent });
    } catch (error) {
      const classified = classifyCheckoutError(error, 'recheck');
      set({ error: classified });
      if (classified.action === 'resolve_from_server') schedulePoll();
    }
  }

  function goReview(): void {
    if (state.view === null || !isOpenForPayment(state.view.order.status)) return;
    set({ phase: 'review', error: null });
  }

  function goMethod(): void {
    if (state.view === null || !isOpenForPayment(state.view.order.status)) return;
    set({ phase: 'method' });
  }

  function chooseMethod(methodId: PaymentMethodId): void {
    if (state.view === null || !isOpenForPayment(state.view.order.status)) return;
    if (!state.view.methods.some((m) => m.id === methodId)) {
      const copy = ineligibilityCopy('METHOD_NOT_OFFERED');
      set({
        error: {
          kind: 'validation',
          title: copy.title,
          body: `${copy.body} ${copy.nextStep}`,
          action: 'change_method',
          retriable: false,
        },
      });
      return;
    }
    set({ methodId, phase: 'confirm', error: null });
  }

  /** Back-navigation. Never cancels the server-side order or intent; just moves the buyer. */
  function back(): void {
    switch (state.phase) {
      case 'method':
        set({ phase: 'review' });
        return;
      case 'confirm':
        set({ phase: 'method' });
        return;
      case 'review':
      case 'outcome':
      case 'unavailable':
        return;
      case 'paying':
      case 'resolving':
        // Standing between the buyer and a "leave while the bank may still be answering" is a
        // cancel-charge vector; back from these lands on the resolving screen, which keeps
        // re-asking the SERVER, not a different flow.
        set({ phase: 'resolving' });
        schedulePoll();
        return;
      case 'error':
        if (state.view !== null) set({ phase: 'review', error: null });
        return;
      default:
        return;
    }
  }

  async function presentIntent(orderId: string, methodId: PaymentMethodId): Promise<PayOutcome> {
    if (state.phase !== 'confirm') return { sent: false, reason: 'not-confirmable' };
    if (inFlightPay) return { sent: false, reason: 'in-flight' };

    inFlightPay = true;
    set({ phase: 'paying', error: null });
    // The tap is the intent boundary: the key comes from the persistent registry, so a retry,
    // a back-navigation re-tap, or a remount re-tap presents the SAME key.
    const key = intents.keyForPayment(orderId);
    try {
      const intent = await api.createPaymentIntent(orderId, { method: methodId, providerReturnRef: orderId }, key);
      inFlightPay = false;
      set({ intent });

      if (intent.state === 'failed') {
        // Terminal server truth: nothing was captured; a deliberate re-tap may be a NEW intent.
        set({ phase: 'outcome', view: await refreshView(orderId) });
        return { sent: true, reason: 'ok' };
      }
      if (intent.state === 'no_charge_required') {
        // Cash on handover: reserved, ordered, and NO money moved — outcome renders from status.
        intents.settlePayment(orderId);
        set({ phase: 'outcome', view: await refreshView(orderId) });
        return { sent: true, reason: 'ok' };
      }
      if (intent.state === 'captured') {
        intents.settlePayment(orderId);
        set({ phase: 'outcome', view: await refreshView(orderId) });
        return { sent: true, reason: 'ok' };
      }
      // requires_redirect / awaiting_provider: the answer is the provider's, so watch the ledger.
      set({ phase: 'resolving' });
      schedulePoll();
      return { sent: true, reason: 'ok' };
    } catch (error) {
      inFlightPay = false;
      const classified = classifyCheckoutError(error, 'paying');
      if (classified.action === 'resolve_from_server') {
        // THE window: we don't know. Do NOT release the key; do NOT mint a new one; go resolve.
        abandon.remember({
          orderId,
          phaseAtExit: 'paying',
          methodId,
          leftAt: new Date().toISOString(),
        });
        set({ phase: 'resolving', error: classified, returnedFromAbandon: false });
        schedulePoll();
        return { sent: true, reason: 'ok' };
      }
      if (
        classified.kind === 'validation' ||
        classified.kind === 'notFound' ||
        classified.kind === 'forbidden'
      ) {
        // Never replayable as-is; the next deliberate tap is a new intent with a new key.
        intents.releaseOnHardFailure(orderId);
      }
      set({ phase: 'error', error: classified });
      return { sent: true, reason: 'ok' };
    }
  }

  async function refreshView(orderId: string): Promise<CheckoutView | null> {
    try {
      return await api.getView(orderId);
    } catch {
      return state.view;
    }
  }

  async function pay(): Promise<PayOutcome> {
    if (state.orderId === null || state.methodId === null) return { sent: false, reason: 'no-method' };
    return presentIntent(state.orderId, state.methodId);
  }

  async function payAgainAfterFailure(): Promise<PayOutcome> {
    if (state.orderId === null || state.methodId === null) return { sent: false, reason: 'no-method' };
    // Gate on SERVER truth, not on our phase: only a failed intent unlocks a fresh key.
    const lastIntent = state.view?.lastIntent ?? null;
    if (lastIntent === null || lastIntent.state !== 'failed') {
      return { sent: false, reason: 'not-confirmable' };
    }
    intents.beginNewAttemptAfterConfirmedFailure(state.orderId);
    set({
      phase: 'confirm',
      attemptNonce: intents.currentNonce(state.orderId),
      error: null,
    });
    return presentIntent(state.orderId, state.methodId);
  }

  /** Called when the buyer navigates away / the page hides: records position for the NEXT visit. */
  function markAbandoned(): void {
    if (state.orderId !== null && (state.phase === 'paying' || state.phase === 'resolving')) {
      abandon.remember({
        orderId: state.orderId,
        phaseAtExit: state.phase,
        methodId: state.methodId,
        leftAt: new Date().toISOString(),
      });
    }
  }

  function dispose(): void {
    disposed = true;
    stopPolling();
    listeners.clear();
  }

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
    goReview,
    goMethod,
    chooseMethod,
    back,
    pay,
    recheck,
    payAgainAfterFailure,
    markAbandoned,
    dispose,
  };
}

/* ------------------------------------------------------------------ React shell */

export interface UseCheckoutOptions {
  readonly orderId: string;
  readonly api?: CheckoutApiOptions;
  readonly intents?: CheckoutIntents;
  readonly abandon?: AbandonStore;
  readonly pollMs?: number;
  readonly maxPolls?: number;
}

/**
 * The page-side wiring. The session is built once per orderId (a remount with the same orderId
 * gets a NEW session object but the SAME persistent intents registry — that asymmetry is exactly
 * what makes remount safe); truth resolution happens in `load`, which reads the transport before
 * rendering any money question.
 */
export function useCheckout({ orderId, api, intents, abandon, pollMs, maxPolls }: UseCheckoutOptions): CheckoutSession {
  const session = useMemo(
    () =>
      createCheckoutSession({
        api: api !== undefined ? createCheckoutApi(api) : devCheckoutApi(),
        intents: intents ?? defaultCheckoutIntents(),
        ...(abandon !== undefined ? { abandon } : {}),
        ...(pollMs !== undefined ? { pollMs } : {}),
        ...(maxPolls !== undefined ? { maxPolls } : {}),
      }),
    // orderId identity is the session identity; remounts reconstruct and re-load.
    [orderId, api, intents, abandon, pollMs, maxPolls],
  );

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void session.load(orderId);
    return () => {
      session.markAbandoned();
      session.dispose();
      started.current = false;
    };
  }, [session, orderId]);

  return session;
}

/** useSyncExternalStore binding so React re-renders on every session transition. */
export function useCheckoutState(session: CheckoutSession): CheckoutSessionState {
  return useSyncExternalStore(session.subscribe, session.state, session.state);
}

// CONTRACT-GAP: there is no HTTP layer yet (ADR 0002), so the app default is the deterministic
// fixture backend. At integration this line becomes `fetchTransport({ baseUrl })` and nothing
// above it changes — that is what the transport seam is for.
let devApi: CheckoutApi | null = null;
function devCheckoutApi(): CheckoutApi {
  if (devApi === null) {
    devApi = createCheckoutApi({ transport: devCheckoutTransport() });
  }
  return devApi;
}

