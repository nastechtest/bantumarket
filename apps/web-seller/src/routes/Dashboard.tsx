import type { RouteDef } from '../router.js';
import Page from '../features/dashboard/index.js';

/** `/` — class `app`. The feature owns the screen; this file exists so the router has one module. */
export default function DashboardRoute({ route }: { route: RouteDef }) {
  return <Page route={route} />;
}
