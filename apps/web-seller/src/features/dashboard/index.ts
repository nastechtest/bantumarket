import { createElement } from 'react';
import type { RouteDef } from '../../router.js';
import { DashboardPage } from './dashboard-page.js';

/**
 * Route entry for `/` (class `app`). `route` is accepted for the router contract; the dashboard
 * has no path parameters. Written with `createElement` so this file stays `.ts` as the brief's
 * file list names it — the page body lives in `dashboard-page.tsx` where JSX belongs.
 */
export default function Page({ route }: { route: RouteDef }) {
  void route;
  return createElement(DashboardPage);
}

export { DashboardPage } from './dashboard-page.js';
export { orderAttention, actionableItems, summariseAttention, moneyBucket } from './action-order.js';
export { nextStepFor } from './next-step.js';
export { timeToFirstListing, listingToLive, metricRows, formatDuration, VANITY_METRICS } from './metrics-that-are-not-vanity.js';
export { createDashboardFixture, DEMO_DASHBOARD, EMPTY_DASHBOARD } from './api/fixtures.js';
export type { AttentionItem, AttentionKind, DashboardSnapshot, DashboardTransport } from './api/dashboard-transport.js';
