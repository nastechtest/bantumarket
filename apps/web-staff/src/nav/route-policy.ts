import type { Capability } from '../shell/permissions.js';
import { capabilityForPath } from '../shell/permissions.js';

/**
 * Navigation groups. The paths here are the only routes the rail may show; the labels come from
 * the controller-owned route table so there is one naming authority. Detail routes are deliberately
 * absent: a rail entry for `/listings/:id` would be a link with no id.
 */
export interface NavGroup {
  readonly id: string;
  readonly title: string;
  readonly paths: readonly string[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  { id: 'work', title: 'Work', paths: ['/', '/disputes', '/risk'] },
  { id: 'programme', title: 'Programme', paths: ['/capture-ops', '/taxonomy'] },
  { id: 'money', title: 'Money', paths: ['/reconciliation', '/payouts'] },
  { id: 'records', title: 'Trust and records', paths: ['/audit', '/users', '/requests'] },
];

/** Static, top-level destinations. A path with `:` or `*` is not a destination, it is a shape. */
export const NAV_PATHS: ReadonlySet<string> = new Set(NAV_GROUPS.flatMap((group) => group.paths));

export function isNavPath(path: string): boolean {
  return NAV_PATHS.has(path);
}

/**
 * The capability token attached to a route. The table lives in the server-facing permission module
 * (brief 60) because it is the same answer the transport is refused by; this wrapper only makes the
 * absent case explicit so nav code cannot treat "no token" as "no restriction".
 */
export function requiredCapability(path: string): Capability | null {
  return capabilityForPath(path);
}
