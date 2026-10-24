/**
 * Critical route. Imports nothing from the scene runtime — the fence (07 §4.3) fails the build if
 * that changes, and `features/checkout/no-3d.test.ts` fails the suite if that changes.
 *
 * The old static placeholder (order ord_01 · Seiko “Presage” · R4,200 · commission R420/10%) is
 * now fixture data in `features/checkout/api/fixtures.ts` — same facts, but sourced through the
 * transport instead of typed into JSX, so what a buyer sees and what the ledger would book are
 * one number with one owner.
 */

import type { RouteDef } from '../router.js';
import { RequireSession } from '../features/auth/routes-guard.js';
import CheckoutFeaturePage from '../features/checkout/index.js';

/**
 * Gated: a buyer who is not signed in gets the sign-in form, not a payment screen. The gate
 * re-verifies with the server on mount (`useSession`), so it does not open on a stored flag.
 */
export default function Checkout({ route }: { route: RouteDef }) {
  return (
    <RequireSession label="Sign in to pay for this order">
      <CheckoutFeaturePage route={route} />
    </RequireSession>
  );
}
