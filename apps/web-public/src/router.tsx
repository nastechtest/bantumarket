import { StrictMode, Suspense, lazy, useSyncExternalStore } from 'react';
import type { ComponentType } from 'react';

/**
 * Hand-rolled router, on purpose. The 3D fence (07 §4.3) has to classify every route by budget
 * class at build time, and the cheapest way to do that is a table this repo owns rather than a
 * matcher whose route objects live in a dependency. Swap for a real router when the fence can read
 * its config; the fence, not the router, is the requirement.
 */

export type RouteClass =
  /** spec §13.4 budget, unchanged: ≤170 KB JS. No scene runtime reachable. */
  | 'first-paint'
  /** 3D inspection class: first-paint budget PLUS ≤400 KB scene JS and ≤2.5 MB asset. */
  | 'scene'
  /** auth, checkout, PIN, handover, dispute-submit. Fence-forbidden from the scene runtime. */
  | 'critical'
  /** Home/discovery class, ≤220 KB per spec §13.4. */
  | 'brand';

export interface RouteDef {
  readonly path: string;
  readonly class: RouteClass;
  readonly label: string;
}

export const Routes: readonly RouteDef[] = [
  { path: '/', class: 'brand', label: 'Home' },
  { path: '/search', class: 'first-paint', label: 'Search' },
  { path: '/item/:id', class: 'first-paint', label: 'Item' },
  { path: '/item/:id/inspect', class: 'scene', label: 'Inspect in 3D' },
  { path: '/checkout/:orderId', class: 'critical', label: 'Checkout' },
  { path: '/handover/:orderId', class: 'critical', label: 'Handover' },
  { path: '/sign-in', class: 'critical', label: 'Sign in' },
  { path: '/register', class: 'critical', label: 'Create an account' },
  { path: '/reset-password', class: 'critical', label: 'Reset your password' },
  { path: '/magic-link', class: 'critical', label: 'Email sign-in link' },
  { path: '/dispute/:orderId', class: 'critical', label: 'Open a dispute' },
  { path: '/orders', class: 'critical', label: 'Orders' },
  { path: '/orders/:orderId', class: 'critical', label: 'Order' },
  { path: '/account', class: 'first-paint', label: 'Your account' },
  { path: '/account/orders', class: 'first-paint', label: 'Your orders' },
  { path: '/account/data-request', class: 'first-paint', label: 'Access or delete your information' },
  { path: '/sell', class: 'brand', label: 'Sell' },
  { path: '/help', class: 'first-paint', label: 'Help and fees' },
  { path: '/safety', class: 'first-paint', label: 'Safety' },
  { path: '/safety/how-it-works', class: 'first-paint', label: 'How a sale works' },
  { path: '/safety/meet-safely', class: 'first-paint', label: 'Meeting safely' },
  { path: '/safety/scam-patterns', class: 'first-paint', label: 'Scam patterns' },
  { path: '/safety/report', class: 'first-paint', label: 'Report' },
  { path: '/safety/trust', class: 'first-paint', label: 'Trust tiers' },
  { path: '/safety/blocking', class: 'first-paint', label: 'Blocking' },
  { path: '/safety/policy/fees', class: 'first-paint', label: 'Fees policy' },
  { path: '/safety/policy/prohibited', class: 'first-paint', label: 'Prohibited items' },
  { path: '/safety/policy/popia', class: 'first-paint', label: 'Personal information' },
  { path: '/safety/policy/children', class: 'first-paint', label: 'Children' },
  { path: '/legal/privacy', class: 'first-paint', label: 'Privacy notice' },
  { path: '/legal/returns', class: 'first-paint', label: 'Returns policy' },
  { path: '/legal/terms', class: 'first-paint', label: 'Terms of sale' },
  { path: '/legal/humans', class: 'first-paint', label: 'The team' },
  { path: '/privacy-notice', class: 'first-paint', label: 'Privacy notice' },
  { path: '*', class: 'first-paint', label: 'Not found' },
];

/** The route classes the scene runtime may never reach, transitively. Single source for the fence. */
export const FORBIDDEN_CLASSES: readonly RouteClass[] = ['critical'];

/**
 * This app can be mounted under a path prefix (`/seller/`, `/staff/`) so one deployment serves all
 * three products from one origin. At the root `BASE` is `''`, so nothing about local development or
 * the separate-project deployment changes. Every history entry and route match goes through the two
 * helpers below, which is what makes the prefix a build flag instead of a rewrite of the app.
 *
 * The cast is deliberate: `import.meta.env` is typed by Vite for the build and undefined under
 * `bun test`, and a router that throws in a test because of its own base path is a router that has
 * coupled the test harness to the bundler.
 */
const BASE = ((import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/').replace(/\/+$/, '');

/** `/seller/item/7` with base `/seller` → `/item/7`. An unprefixed path is returned as it came in. */
export function stripBase(pathname: string, base: string = BASE): string {
  if (base === '') return pathname;
  if (pathname === base) return '/';
  return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
}

/** `/item/7` with base `/seller` → `/seller/item/7`. Used for every pushState. */
export function withBase(path: string, base: string = BASE): string {
  const normalised = path.startsWith('/') ? path : `/${path}`;
  return base === '' ? normalised : `${base}${normalised}`;
}

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
window.addEventListener('popstate', emit);
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement)?.closest?.('a[href^="/"]');
  if (!a) return;
  e.preventDefault();
  navigate(a.getAttribute('href')!);
});

export function navigate(path: string) {
  window.history.pushState({}, '', withBase(path));
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function matches(pattern: string, pathname: string): boolean {
  const p = pattern.split('/');
  const a = pathname.split('/');
  if (p.length !== a.length) return false;
  return p.every((seg, i) => seg.startsWith(':') || seg === a[i]);
}

export function resolve(pathname: string): RouteDef {
  return (
    Routes.find((r) => r.path === pathname) ??
    Routes.find((r) => r.path.includes(':') && matches(r.path, pathname)) ??
    Routes.find((r) => r.path === '*')!
  );
}

export function useRoute(): RouteDef {
  return resolve(
    useSyncExternalStore(
      subscribe,
      () => stripBase(window.location.pathname),
      () => '/',
    ),
  );
}

type Page = ComponentType<{ route: RouteDef }>;

const pages: Record<string, () => Promise<{ default: Page }>> = {
  '/': () => import('./routes/Home.js'),
  '/search': () => import('./routes/Search.js'),
  '/item/:id': () => import('./routes/ItemPage.js'),
  '/item/:id/inspect': () => import('./routes/Inspect.js'),
  '/checkout/:orderId': () => import('./routes/Checkout.js'),
  '/handover/:orderId': () => import('./routes/Handover.js'),
  '/sign-in': () => import('./routes/SignIn.js'),
  '/register': () => import('./routes/Register.js'),
  '/reset-password': () => import('./routes/ResetPassword.js'),
  '/magic-link': () => import('./routes/MagicLink.js'),
  '/dispute/:orderId': () => import('./routes/Dispute.js'),
  '/orders': () => import('./routes/Orders.js'),
  '/orders/:orderId': () => import('./routes/OrderDetail.js'),
  '/account': () => import('./routes/Account.js'),
  '/account/orders': () => import('./routes/AccountOrders.js'),
  '/account/data-request': () => import('./routes/AccountDataRequest.js'),
  '/sell': () => import('./routes/Sell.js'),
  '/help': () => import('./routes/Help.js'),
  '/safety': () => import('./routes/Safety.js'),
  '/safety/how-it-works': () => import('./routes/SafetyHowItWorks.js'),
  '/safety/meet-safely': () => import('./routes/SafetyMeetSafely.js'),
  '/safety/scam-patterns': () => import('./routes/SafetyScamPatterns.js'),
  '/safety/report': () => import('./routes/SafetyReport.js'),
  '/safety/trust': () => import('./routes/SafetyTrust.js'),
  '/safety/blocking': () => import('./routes/SafetyBlocking.js'),
  '/safety/policy/fees': () => import('./routes/SafetyFees.js'),
  '/safety/policy/prohibited': () => import('./routes/SafetyProhibited.js'),
  '/safety/policy/popia': () => import('./routes/SafetyPopia.js'),
  '/safety/policy/children': () => import('./routes/SafetyChildren.js'),
  '/legal/privacy': () => import('./routes/LegalPrivacy.js'),
  '/legal/returns': () => import('./routes/LegalReturns.js'),
  '/legal/terms': () => import('./routes/LegalTerms.js'),
  '/legal/humans': () => import('./routes/LegalHumans.js'),
  '/privacy-notice': () => import('./routes/PrivacyNotice.js'),
  '*': () => import('./routes/NotFound.js'),
};

const elements: Record<string, Page> = Object.fromEntries(
  Object.entries(pages).map(([path, load]) => [path, lazy(load)]),
);

export function App() {
  const route = useRoute();
  const Page = elements[route.path] ?? elements['*']!;
  return (
    <StrictMode>
      <div className="page">
        <Suspense fallback={<div className="route-loading" aria-busy="true">Loading…</div>}>
          <Page route={route} />
        </Suspense>
      </div>
    </StrictMode>
  );
}
