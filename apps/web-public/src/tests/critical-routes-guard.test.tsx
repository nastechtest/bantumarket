import { afterEach, beforeAll, describe, expect, it } from 'bun:test';
import type { ReactElement } from 'react';
import { act } from 'react';
import type { RouteDef } from '../router.js';
import CheckoutRoute from '../routes/Checkout.js';
import HandoverRoute from '../routes/Handover.js';
import DisputeRoute from '../routes/Dispute.js';
import SignInRoute from '../routes/SignIn.js';
import { createHarness, type RenderHarness } from '../test-support/test-dom.js';

/**
 * The no-session proof for every route the router classes `critical`.
 *
 * These mount the *route modules*, not the feature pages, because the thing worth proving is the
 * wiring: `RequireSession` exists, and a gate that no route uses is a gate that can be deleted in a
 * refactor without any test going red. Each block starts with no session, asserts the refusal, and
 * asserts that the protected screen never reached the DOM — so a regression that renders the payment
 * form to an anonymous visitor fails here even if every feature test still passes.
 */

let h: RenderHarness;
/** Read from the live table after the DOM exists: `router.tsx` binds popstate at module load. */
let routes: readonly RouteDef[];
beforeAll(async () => {
  h = await createHarness();
  ({ Routes: routes } = await import('../router.js'));
});
afterEach(() => h.reset());

function routeFor(path: string): RouteDef {
  const def = routes.find((r) => r.path === path);
  if (def === undefined) throw new Error(`router has no '${path}' entry to guard`);
  return def;
}

/** Mount with no session and settle the guard's server check before returning the DOM. */
async function mountAnonymous(ui: ReactElement): Promise<HTMLElement> {
  let container: HTMLElement | null = null;
  await act(async () => {
    container = h.render(ui).container;
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  if (container === null) throw new Error('mount did not produce a container');
  return container;
}

const guard = (el: HTMLElement): boolean => el.querySelector('[data-testid="guard-signin"]') !== null;

describe('critical routes refuse a visitor with no session', () => {
  it('/checkout/:orderId redirects the anonymous buyer to sign-in and never renders the payment screen', async () => {
    const el = await mountAnonymous(<CheckoutRoute route={routeFor('/checkout/:orderId')} />);
    expect(guard(el)).toBe(true);
    expect(el.querySelector('[data-testid="checkout-page"]')).toBeNull();
    expect(el.querySelector('[data-testid="checkout-loading"]')).toBeNull();
    expect(el.textContent).toContain('Sign in to pay for this order');
  });

  it('/handover/:orderId with no session guards the PIN screen behind sign-in', async () => {
    const el = await mountAnonymous(<HandoverRoute route={routeFor('/handover/:orderId')} />);
    expect(guard(el)).toBe(true);
    expect(el.querySelector('[data-testid="handover-page"]')).toBeNull();
    expect(el.querySelector('[data-testid="confirm-handover"]')).toBeNull();
    expect(el.textContent).toContain('Sign in to open the exchange');
  });

  it('/dispute/:orderId refuses an anonymous visitor instead of opening a money claim', async () => {
    const el = await mountAnonymous(<DisputeRoute route={routeFor('/dispute/:orderId')} />);
    expect(guard(el)).toBe(true);
    expect(el.querySelector('.dp-root')).toBeNull();
    expect(el.querySelector('textarea#report-narrative')).toBeNull();
    expect(el.textContent).toContain('Sign in to open this dispute');
  });

  it('/sign-in with no session renders the credential step and does not hand out a signed-in screen', async () => {
    const el = await mountAnonymous(<SignInRoute route={routeFor('/sign-in')} />);
    expect(el.querySelector('[data-testid="signin-page"]')).not.toBeNull();
    // The refusal here is that credentials are the only way in: no session check has passed, so
    // none of the surfaces that require one may appear.
    expect(el.querySelector('[data-testid="checkout-page"]')).toBeNull();
    expect(el.querySelector('[data-testid="handover-page"]')).toBeNull();
    expect(el.querySelector('.dp-root')).toBeNull();
  });
});
