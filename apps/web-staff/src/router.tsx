import { StrictMode, Suspense, lazy, useSyncExternalStore } from 'react';
import type { ComponentType } from 'react';

/**
 * Same hand-rolled router as apps/web-public, and deliberately so: the budget classes below are the
 * fence's input, and the fence has to read a table this repo owns. Internal apps get 'scene' only on
 * capture review — an operations console that cannot render a model is useless, but a payout screen
 * that can is a liability.
 */

export type RouteClass =
  /** normal internal screen; no scene runtime allowed. */
  | 'app'
  /** may reach the scene runtime, lazily and on this route only. */
  | 'scene'
  /** money or credential surfaces: the scene runtime may never be reachable, even lazily. */
  | 'critical';

export interface RouteDef {
  readonly path: string;
  readonly class: RouteClass;
  readonly label: string;
}

export const Routes: readonly RouteDef[] = [
  { path: '/sign-in', class: 'critical', label: 'Sign in' },
  { path: '/', class: 'app', label: 'Review queue' },
  { path: '/listings/:id', class: 'app', label: 'Listing review' },
  { path: '/listings/:id/capture', class: 'scene', label: 'Capture QC' },
  { path: '/disputes', class: 'app', label: 'Disputes' },
  { path: '/disputes/:id', class: 'app', label: 'Dispute case' },
  { path: '/risk', class: 'app', label: 'Risk cases' },
  { path: '/risk/:caseId', class: 'app', label: 'Risk case' },
  { path: '/reconciliation', class: 'critical', label: 'Reconciliation' },
  { path: '/payouts', class: 'critical', label: 'Payout ops' },
  { path: '/capture-ops', class: 'app', label: 'Capture programme' },
  { path: '/taxonomy', class: 'app', label: 'Catalogue' },
  { path: '/users', class: 'app', label: 'Accounts' },
  { path: '/audit', class: 'critical', label: 'Audit trail' },
  { path: '/requests', class: 'app', label: 'POPIA requests' },
  { path: '*', class: 'app', label: 'Not found' },
];

export const FORBIDDEN_CLASSES: readonly RouteClass[] = ['critical', 'app'];

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
  '/sign-in': () => import('./routes/SignIn.js'),
  '/': () => import('./routes/Queue.js'),
  '/listings/:id': () => import('./routes/ListingReview.js'),
  '/listings/:id/capture': () => import('./routes/CaptureQc.js'),
  '/disputes': () => import('./routes/Disputes.js'),
  '/disputes/:id': () => import('./routes/DisputeCase.js'),
  '/risk': () => import('./routes/RiskCases.js'),
  '/risk/:caseId': () => import('./routes/RiskCase.js'),
  '/reconciliation': () => import('./routes/Reconciliation.js'),
  '/payouts': () => import('./routes/PayoutOps.js'),
  '/capture-ops': () => import('./routes/CaptureOps.js'),
  '/taxonomy': () => import('./routes/Taxonomy.js'),
  '/users': () => import('./routes/Users.js'),
  '/audit': () => import('./routes/Audit.js'),
  '/requests': () => import('./routes/PopiaRequests.js'),
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
