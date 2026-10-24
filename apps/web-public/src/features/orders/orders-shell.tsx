import { useMemo, useState } from 'react';
import { raw } from '@nastech/design-tokens';
import type { RouteDef } from '../../router.js';
import { OrdersList } from './orders-list.js';
import { OrderDetail } from './order-detail.js';
import { useOrder, useOrders } from './use-orders.js';
import { createFixtureOrdersTransport } from './api/fixtures.js';
import type { OrderRole, OrdersTransport } from './api/orders-transport.js';

/**
 * Feature shell for `orders`. The controller wires it at:
 *   /orders            → list view (role switch inside)
 *   /orders/:orderId   → detail view
 * `?view=seller` is the role switch; the buyer view is the default because the buyer is the
 * party the handover money language most often misleads.
 *
 * The transport is injected here and nowhere below it: swapping the fixture for an HTTP
 * adapter is one line at this seam, and no component learns about it.
 */

export interface OrdersShellProps {
  readonly route: RouteDef;
  /** Injectable for tests; the demo build uses the fixtures. */
  readonly transport?: OrdersTransport;
}

/** Router never exposes a device-clock dependency here; `window` is read for the pathname only. */
function currentLocation(): { pathname: string; search: string } {
  if (typeof window === 'undefined') return { pathname: '/orders', search: '' };
  return { pathname: window.location.pathname, search: window.location.search };
}

export function OrdersShell({ route, transport }: OrdersShellProps) {
  const active = useMemo(() => transport ?? createFixtureOrdersTransport(), [transport]);
  const loc = currentLocation();
  const orderId = extractOrderId(route, loc.pathname);
  const [role, setRole] = useState<OrderRole>(() => (new URLSearchParams(loc.search).get('view') === 'seller' ? 'seller' : 'buyer'));

  if (orderId === null) {
    return (
      <div style={{ display: 'grid', gap: raw.space.s4 }}>
        <RoleTabs role={role} onRole={setRole} />
        <OrdersListPage transport={active} role={role} onRole={setRole} />
      </div>
    );
  }
  return <OrderDetailPage transport={active} orderId={orderId} role={role} />;
}

function OrdersListPage({ transport, role }: { transport: OrdersTransport; role: OrderRole; onRole: (r: OrderRole) => void }) {
  const { load, reload } = useOrders(transport, role);
  return <OrdersList load={load} role={role} onRetry={reload} />;
}

function OrderDetailPage({ transport, orderId, role }: { transport: OrdersTransport; orderId: string; role: OrderRole }) {
  const { load } = useOrder(transport, orderId);
  if (load.kind === 'loading') return <p aria-busy="true">Loading order…</p>;
  if (load.kind === 'failed') return <p role="alert">{load.message}</p>;
  return <OrderDetail order={load.data} role={role} transport={transport} />;
}

function RoleTabs({ role, onRole }: { role: OrderRole; onRole: (r: OrderRole) => void }) {
  return (
    <div role="tablist" aria-label="Order perspective" style={{ display: 'flex', gap: raw.space.s2 }}>
      {(['buyer', 'seller'] as const).map((r) => (
        <button
          key={r}
          type="button"
          role="tab"
          aria-selected={r === role}
          onClick={() => onRole(r)}
          style={{
            padding: `${raw.space.s2} ${raw.space.s4}`,
            borderRadius: raw.radius.md,
            border: `1px solid ${r === role ? raw.color.accent600 : raw.color.ink100}`,
            background: r === role ? raw.color.accent600 : 'transparent',
            color: r === role ? raw.color.paper : raw.color.ink900,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {r === 'buyer' ? 'As buyer' : 'As seller'}
        </button>
      ))}
    </div>
  );
}

/**
 * The router hands a `RouteDef` whose `path` may be the pattern (`/orders/:orderId`); the real
 * id lives in the live pathname at the same segment index. Kept as a pure function so a test
 * can pin pattern↔segment alignment without a DOM.
 */
export function extractOrderId(route: RouteDef, pathname: string): string | null {
  const segs = pathname.split('/').filter((s) => s.length > 0);
  const pattern = route.path.split('/').filter((s) => s.length > 0);
  const idx = pattern.findIndex((s) => s.startsWith(':') || s.startsWith('{'));
  if (idx >= 0) return segs.length > idx ? decodeURIComponent(segs[idx] ?? '') : null;
  // A concrete pattern like `/orders` is the list; anything deeper without a placeholder is
  // treated as an id by position, so `/orders/ord_02` still resolves.
  if (pattern.length === 1 && segs.length === 2 && segs[0] === pattern[0]) return decodeURIComponent(segs[1] ?? '');
  return null;
}
