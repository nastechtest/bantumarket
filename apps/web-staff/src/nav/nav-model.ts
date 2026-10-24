import { Routes } from '../router.js';
import type { RouteDef } from '../router.js';
import type { Capability } from '../shell/permissions.js';
import type { StaffSession } from '../shell/session.js';
import { canSee } from './can-see.js';
import { NAV_GROUPS, requiredCapability } from './route-policy.js';

export interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly capability: Capability;
}

export interface NavSection {
  readonly id: string;
  readonly title: string;
  readonly items: readonly NavItem[];
}

const ROUTE_BY_PATH: ReadonlyMap<string, RouteDef> = new Map(Routes.map((route) => [route.path, route]));

/**
 * Derives the rail from the route table and filters it with `canSee`. Empty groups disappear: a
 * heading with no destinations is a promise the session cannot keep. Labels are the table's, so a
 * route rename cannot leave a stale nav string behind.
 */
export function buildNavModel(
  session: StaffSession | null,
  nowIso: string = new Date().toISOString(),
): readonly NavSection[] {
  const sections: NavSection[] = [];
  for (const group of NAV_GROUPS) {
    const items: NavItem[] = [];
    for (const path of group.paths) {
      const route = ROUTE_BY_PATH.get(path);
      if (route === undefined) continue;
      if (!canSee(route, session, nowIso)) continue;
      const capability = requiredCapability(path);
      if (capability === null) continue;
      items.push({ path, label: route.label, capability });
    }
    if (items.length > 0) sections.push({ id: group.id, title: group.title, items });
  }
  return sections;
}

export function visibleNavItems(
  session: StaffSession | null,
  nowIso: string = new Date().toISOString(),
): readonly NavItem[] {
  return buildNavModel(session, nowIso).flatMap((section) => section.items);
}

/**
 * Detail paths light their list entry: `/disputes/case_42` keeps "Disputes" current. `/` is exact
 * because every path starts with a slash and would otherwise stay highlighted everywhere.
 */
export function isCurrentNavPath(itemPath: string, pathname: string): boolean {
  if (itemPath === '/') return pathname === '/';
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}
