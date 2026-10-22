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
  { path: '/dispute/:orderId', class: 'critical', label: 'Open a dispute' },
  { path: '*', class: 'first-paint', label: 'Not found' },
];

/** The route classes the scene runtime may never reach, transitively. Single source for the fence. */
export const FORBIDDEN_CLASSES: readonly RouteClass[] = ['critical'];

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
  window.history.pushState({}, '', path);
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
      () => window.location.pathname,
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
  '/dispute/:orderId': () => import('./routes/Dispute.js'),
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
