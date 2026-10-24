import type { RouteClass, RouteDef } from '../router.js';

/**
 * Navigation is a *view* of the router's route table, never a second list.
 *
 * `deriveNav` accounts for every route exactly once: either it becomes a nav item, or it is
 * excluded with a written reason. A route added to `Routes` therefore appears in the seller's
 * navigation on the next render; forgetting it is not possible, only deliberately excluding it.
 */

export interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly routeClass: RouteClass;
}

export interface NavExclusion {
  readonly path: string;
  readonly reason: string;
}

export const NAV_EXCLUSIONS: readonly NavExclusion[] = [
  {
    path: '/onboarding',
    reason: 'First-run flow rather than a destination; the dashboard surfaces its next step in context.',
  },
  {
    path: '/listings/new',
    reason: 'An action started from My listings, not a place a seller returns to from the nav.',
  },
  {
    path: '/sign-in',
    reason: 'Credential entry, reached only as a guard redirect; a nav link would invite a signed-in seller to sign in again.',
  },
  {
    path: '*',
    reason: 'The not-found fallback has no address of its own to navigate to.',
  },
];

export interface NavDerivation {
  readonly items: readonly NavItem[];
  readonly excluded: readonly NavExclusion[];
}

const PARAMETER_EXCLUSION_REASON =
  'Detail route: it needs a concrete record id, so its list section carries the navigation entry.';

export function isParameterRoute(path: string): boolean {
  return path.split('/').some((segment) => segment.startsWith(':'));
}

export function navItemFor(route: RouteDef): NavItem {
  return { path: route.path, label: route.label, routeClass: route.class };
}

export function deriveNav(
  routes: readonly RouteDef[],
  exclusions: readonly NavExclusion[] = NAV_EXCLUSIONS,
): NavDerivation {
  const reasonByPath = new Map(exclusions.map((entry) => [entry.path, entry.reason] as const));
  const items: NavItem[] = [];
  const excluded: NavExclusion[] = [];

  for (const route of routes) {
    if (isParameterRoute(route.path)) {
      excluded.push({ path: route.path, reason: PARAMETER_EXCLUSION_REASON });
      continue;
    }
    const reason = reasonByPath.get(route.path);
    if (reason !== undefined) {
      excluded.push({ path: route.path, reason });
      continue;
    }
    items.push(navItemFor(route));
  }

  return { items, excluded };
}

function normalizePathname(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/)[0] ?? '';
  if (withoutQuery === '') return '/';
  if (withoutQuery === '/') return '/';
  return withoutQuery.replace(/\/+$/, '');
}

/**
 * Which nav row represents the current screen. Detail routes keep their list lit
 * (`/listings/lst_01/capture` -> `/listings`), and a path only matches on a segment boundary,
 * so `/listings-archive` does not light `/listings`.
 */
export function activeNavPath(pathname: string, items: readonly NavItem[]): string | null {
  const current = normalizePathname(pathname);
  let best: string | null = null;

  for (const item of items) {
    const matches =
      item.path === '/'
        ? current === '/'
        : current === item.path || current.startsWith(`${item.path}/`);
    if (matches && (best === null || item.path.length > best.length)) best = item.path;
  }

  return best;
}
