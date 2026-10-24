import type { RouteDef } from '../router.js';
import { DataRequestPage } from '../features/account/index.js';

/**
 * `/account/data-request` — first-paint and deliberately ungated: the POPIA request path must stay
 * reachable when a person can no longer sign in.
 */
export default function AccountDataRequest({ route }: { route: RouteDef }) {
  return (
    <div data-page={route.path}>
      <DataRequestPage />
    </div>
  );
}
