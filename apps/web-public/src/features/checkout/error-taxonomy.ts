/**
 * Checkout's error taxonomy: `ApiError.kind` in, buyer-safe copy + one action out.
 *
 * Two rules make this file exist:
 *   1. A message is built from this table only. `Error.message` of anything not an `ApiError` is
 *      NEVER read — lower layers can echo request material into a throw, and "request material"
 *      for a payment call is provider data. A declined-card exception must not become a page that
 *      prints what it accidentally caught.
 *   2. During the paying phase, the api-client's timeout copy ("Nothing has been changed — try
 *      again") is WRONG for money: the request may have changed plenty, server-side, while our
 *      client gave up waiting. That window gets its own copy and its own action — resolve from
 *      the transport — and this file is where the override lives.
 */

import { isApiError } from '@nastech/api-client';
import type { ApiErrorKind } from '@nastech/api-client';

export type CheckoutErrorAction =
  /** Retry the request as-is (a GET — nothing to duplicate). */
  | 'retry_request'
  /** Keep the SAME idempotency key; ask the server what is true. Never assume failure. */
  | 'resolve_from_server'
  /** The intent is terminally failed server-side; a deliberate new one may be started. */
  | 'start_new_intent'
  | 'change_method'
  | 'sign_in'
  | 'contact_support';

export interface CheckoutErrorView {
  readonly kind: ApiErrorKind | 'unknown';
  readonly title: string;
  readonly body: string;
  readonly action: CheckoutErrorAction;
  readonly retriable: boolean;
}

export type CheckoutErrorWindow = 'load' | 'paying' | 'recheck';

function payingUncertain(kind: ApiErrorKind): CheckoutErrorView {
  // The exact window the double-charge tests end in: we do not know, and neither does a spinner.
  return {
    kind,
    title: 'We could not confirm your payment',
    body:
      'Your payment may or may not have reached the provider. We will not say it failed while that is unknown, and we will not send a new payment on our own — the screen below checks the true state with NasTech before anything else happens.',
    action: 'resolve_from_server',
    retriable: false,
  };
}

const LOAD_COPY: Readonly<Partial<Record<ApiErrorKind, CheckoutErrorView>>> = {
  unauthorized: {
    kind: 'unauthorized',
    title: 'Sign in to continue',
    body: 'This checkout belongs to a signed-in account. Sign in and come back — your order and your place in this flow are kept.',
    action: 'sign_in',
    retriable: false,
  },
  forbidden: {
    kind: 'forbidden',
    title: 'This checkout is not yours',
    body: 'Orders can only be paid by the buyer they were created for.',
    action: 'contact_support',
    retriable: false,
  },
  notFound: {
    kind: 'notFound',
    title: 'We could not find this order',
    body: 'The order for this checkout does not exist (or no longer does). If you followed a link, double-check the order ID.',
    action: 'contact_support',
    retriable: false,
  },
  rateLimited: {
    kind: 'rateLimited',
    title: 'Too many requests',
    body: 'Give it a moment and reload — this screen only reads, so reloading is safe.',
    action: 'retry_request',
    retriable: true,
  },
  network: {
    kind: 'network',
    title: 'We could not reach NasTech',
    body: 'Check your connection and try again. Nothing has been sent yet, so there is nothing to undo.',
    action: 'retry_request',
    retriable: true,
  },
  timeout: {
    kind: 'timeout',
    title: 'NasTech took too long to respond',
    body: 'This screen was only reading the order, so trying again is safe.',
    action: 'retry_request',
    retriable: true,
  },
  providerUnavailable: {
    kind: 'providerUnavailable',
    title: 'NasTech is having trouble right now',
    body: 'This was a read, so nothing changed. Try again in a moment.',
    action: 'retry_request',
    retriable: true,
  },
  validation: {
    kind: 'validation',
    title: 'This checkout cannot be shown',
    body: 'The order details on this screen do not line up with what the ledger holds. Nothing can be paid until they do.',
    action: 'contact_support',
    retriable: false,
  },
};

export const UNKNOWN_ERROR: CheckoutErrorView = {
  kind: 'unknown',
  title: 'Something went wrong',
  body: 'We could not finish this action. Nothing about your payment has been assumed — the order state on the next screen comes from the server.',
  action: 'resolve_from_server',
  retriable: false,
};

/**
 * The one classifier. `window` picks the copy: the same `timeout` kind means "safe to retry"
 * while loading and "resolve the truth, do not re-send" while paying — the difference between a
 * refresh and a double charge.
 */
export function classifyCheckoutError(error: unknown, window: CheckoutErrorWindow): CheckoutErrorView {
  if (!isApiError(error)) {
    // Deliberately NOT reading `error.message`: see header rule 1. A non-ApiError from a payment
    // window is the most dangerous place to echo a string.
    return window === 'load'
      ? { ...UNKNOWN_ERROR, title: 'Something went wrong', action: 'retry_request' }
      : UNKNOWN_ERROR;
  }

  if (window !== 'load' && (error.kind === 'timeout' || error.kind === 'network')) {
    return payingUncertain(error.kind);
  }
  if (window !== 'load' && error.kind === 'providerUnavailable') {
    // 5xx with money in flight: api-client's own copy already refuses to claim an outcome; in the
    // paying window it still must route to the truth resolver, not a blind retry.
    return payingUncertain(error.kind);
  }

  return LOAD_COPY[error.kind] ?? UNKNOWN_ERROR;
}
