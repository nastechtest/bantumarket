import { describe, expect, it } from 'bun:test';
import type { ReactElement } from 'react';
import { mount, flush, byTestId, type Mounted } from '../features/auth/test-dom.js';
import type { RouteDef } from '../router.js';
import RegisterRoute from '../routes/Register.js';
import ResetPasswordRoute from '../routes/ResetPassword.js';
import MagicLinkRoute from '../routes/MagicLink.js';
import OrdersRoute from '../routes/Orders.js';
import OrderDetailRoute from '../routes/OrderDetail.js';

/**
 * No-session proof for the identity routes and the money-bearing order routes.
 *
 * Each route is mounted with no session. The refusal is asserted as two facts: the sign-in or
 * identity surface is present, and the protected money screen never reached the DOM.
 */

const route = (path: string, label: string): RouteDef => ({ path, class: 'critical', label });

async function anonymous(ui: ReactElement): Promise<{ readonly el: HTMLElement; readonly m: Mounted }> {
  const m = mount(ui);
  await m.flush();
  await m.flush();
  return { el: m.container, m };
}

describe('identity routes with no session', () => {
  it('/register offers only the identity flow and does not render checkout, handover or disputes', async () => {
    const { el, m } = await anonymous(<RegisterRoute route={route('/register', 'Create an account')} />);
    expect(el.querySelector('[data-testid="register-page"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="checkout-page"]')).toBeNull();
    expect(el.querySelector('[data-testid="handover-page"]')).toBeNull();
    expect(el.querySelector('.dp-root')).toBeNull();
    m.unmount();
  });

  it('/reset-password offers the reset request and does not render a signed-in money screen', async () => {
    const { el, m } = await anonymous(<ResetPasswordRoute route={route('/reset-password', 'Reset your password')} />);
    expect(el.querySelector('[data-testid="reset-request"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="checkout-page"]')).toBeNull();
    expect(el.querySelector('[data-testid="handover-page"]')).toBeNull();
    m.unmount();
  });

  it('/magic-link with no session renders the email request, not a session-bearing screen', async () => {
    const { el, m } = await anonymous(<MagicLinkRoute route={route('/magic-link', 'Email sign-in link')} />);
    expect(el.querySelector('[data-testid="magic-request"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="checkout-page"]')).toBeNull();
    expect(el.querySelector('.dp-root')).toBeNull();
    m.unmount();
  });
});

describe('order routes with no session', () => {
  it('/orders refuses an anonymous visitor and does not render the orders list', async () => {
    const { el, m } = await anonymous(<OrdersRoute route={route('/orders', 'Orders')} />);
    expect(byTestId(el, 'guard-signin')).not.toBeNull();
    expect(el.querySelector('[data-testid="orders-list"]')).toBeNull();
    expect(el.textContent).toContain('Sign in to see your orders');
    m.unmount();
  });

  it('/orders/:orderId with no session does not render the order detail or cancel flow', async () => {
    const { el, m } = await anonymous(<OrderDetailRoute route={route('/orders/:orderId', 'Order')} />);
    expect(byTestId(el, 'guard-signin')).not.toBeNull();
    expect(el.querySelector('[data-testid="order-detail"]')).toBeNull();
    expect(el.querySelector('[data-testid="cancel-flow"]')).toBeNull();
    expect(el.textContent).toContain('Sign in to open this order');
    m.unmount();
  });
});
