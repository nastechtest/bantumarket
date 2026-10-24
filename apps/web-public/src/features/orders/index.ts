import { createElement } from 'react';
import type { RouteDef } from '../../router.js';
import { OrdersShell } from './orders-shell.js';
import type { OrdersTransport } from './api/orders-transport.js';

/**
 * Feature entry, per the wave-b route contract: `export default function Page({ route })`.
 * `createElement` rather than JSX because this file is `.ts`; the page body lives in
 * `orders-shell.tsx` where the JSX belongs.
 */
export default function Page({ route, transport }: { route: RouteDef; transport?: OrdersTransport }) {
  return createElement(OrdersShell, { route, ...(transport !== undefined ? { transport } : {}) });
}

export { OrdersShell, extractOrderId } from './orders-shell.js';
export { STATE_LABELS, ORDER_STATES, ladderView, canAct, moneyPosition } from './state-labels.js';
export type { OrderState, StateLabel } from './state-labels.js';
