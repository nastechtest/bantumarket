/**
 * Checkout feature entry — the wave-B route contract: `export default function Page({ route })`.
 *
 * The router (controller-owned) lazy-imports `routes/Checkout.js` for the critical route
 * `/checkout/:orderId`; this module is what it lands on. The orderId is read from the live
 * location because `RouteDef` carries the pattern, not the concrete path.
 */

import { createElement } from 'react';
import type { RouteDef } from '../../router.js';
import { CheckoutPage } from './checkout-page.js';

export { CheckoutPage };
export { createCheckoutSession, useCheckout, useCheckoutState } from './use-checkout.js';
export type { CheckoutSession, CheckoutSessionState, PayOutcome } from './use-checkout.js';
export { CheckoutIntents, createMemoryNonceStore, defaultCheckoutIntents } from './idempotency.js';
export { createCheckoutApi } from './api/checkout-transport.js';
export type {
  CheckoutApi,
  CheckoutApiOptions,
  CheckoutView,
  FeeRow,
  PaymentIntentResult,
  PaymentMethodId,
} from './api/checkout-transport.js';
export { createFixtureBackend, devCheckoutTransport } from './api/fixtures.js';
export type { FixtureBackend } from './api/fixtures.js';
export * as checkoutState from './state-machine.js';

export function orderIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/checkout\/([^/?#]+)/);
  return match !== null ? decodeURIComponent(match[1]!) : null;
}

export default function CheckoutFeaturePage({ route }: { route: RouteDef }) {
  // `route` is the RouteDef for /checkout/:orderId; the concrete id comes from the location the
  // router resolved. Fallback to the dev fixture order so the page is never a dead end.
  const orderId = (typeof window !== 'undefined' && orderIdFromPath(window.location.pathname)) || 'ord_01';
  // `createElement` instead of JSX because the wave convention names this file index.ts.
  void route;
  return createElement(CheckoutPage, { orderId });
}
