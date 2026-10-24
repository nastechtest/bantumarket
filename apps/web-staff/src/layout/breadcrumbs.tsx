import { Routes } from '../router.js';
import type { RouteDef } from '../router.js';
import { NAV_GROUPS } from '../nav/route-policy.js';

export interface Crumb {
  readonly label: string;
  readonly href?: string;
  readonly current?: boolean;
}

const PARENTS: Readonly<Record<string, string>> = {
  '/listings/:id': '/',
  '/listings/:id/capture': '/listings/:id',
  '/disputes/:id': '/disputes',
  '/risk/:caseId': '/risk',
};

const ROUTE_BY_PATH: ReadonlyMap<string, RouteDef> = new Map(Routes.map((route) => [route.path, route]));

/**
 * Location, not history. The trail is derived from the route table: list routes are the ancestors of
 * their detail routes, and a top-level route sits under its nav group. No crumb ever contains a
 * record id — the pattern is the identity a refusal is allowed to reveal.
 */
export function trailFor(route: RouteDef): readonly Crumb[] {
  if (route.path === '/' || route.path === '*') return [];

  const ancestors: RouteDef[] = [];
  let parentPath: string | undefined = PARENTS[route.path];
  while (parentPath !== undefined) {
    const parent = ROUTE_BY_PATH.get(parentPath);
    if (parent === undefined) break;
    ancestors.unshift(parent);
    parentPath = PARENTS[parent.path];
  }

  const crumbs: Crumb[] = [];
  if (ancestors.length === 0) {
    const group = NAV_GROUPS.find((candidate) => candidate.paths.includes(route.path));
    // A lone current-page crumb is not a breadcrumb; it is the page title repeated.
    if (group === undefined) return [];
    crumbs.push({ label: group.title });
  }

  for (const ancestor of ancestors) {
    crumbs.push(
      ancestor.path.includes(':')
        ? { label: ancestor.label }
        : { label: ancestor.label, href: ancestor.path },
    );
  }
  crumbs.push({ label: route.label, current: true });
  return crumbs;
}

export function Breadcrumbs({ route }: { route: RouteDef }) {
  const trail = trailFor(route);
  if (trail.length === 0) return null;
  return (
    <nav className="ops-breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1;
          return (
            <li key={`${crumb.label}-${index}`}>
              {last || crumb.href === undefined ? (
                <span {...(last ? { 'aria-current': 'page' as const } : {})}>{crumb.label}</span>
              ) : (
                <a href={crumb.href}>{crumb.label}</a>
              )}
              {last ? null : <span aria-hidden="true"> / </span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
