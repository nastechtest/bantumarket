import { useMemo } from 'react';
import { createElement } from 'react';
import type { RouteDef } from '../../router.js';
import { DisputePage } from './dispute-page.js';
import { createFixtureService } from './api/fixtures.js';
import type { DisputePrincipal, DisputeService } from './api/dispute-transport.js';

/**
 * Feature entry per the wave-B route contract (`export default function Page({ route })`): the
 * router binds `/dispute/:orderId` to `routes/Dispute.tsx`, which renders this. The concrete order
 * id is resolved inside `DisputePage` from the live location, because `RouteDef` carries the
 * pattern and not the path.
 *
 * The default principal is the fixture order's buyer because this app has no live session yet.
 * `routes/Dispute.tsx` gates the route behind `RequireSession`, so the principal here stands in for
 * what a real session would supply; when the API is wired, the wrapper passes the authenticated
 * principal instead. Passing `principal={null}` is still honoured — `useDispute` short-circuits to
 * its `needs_sign_in` phase without touching the transport — which is what makes the gate testable
 * rather than assumed.
 */

const FIXTURE_BUYER: DisputePrincipal = { actor: 'buyer', userId: 'usr_buyer_1' };

export interface DisputeFeaturePageProps {
  readonly route: RouteDef;
  readonly service?: DisputeService;
  readonly principal?: DisputePrincipal | null;
  readonly orderId?: string;
}

export default function DisputeFeaturePage(props: DisputeFeaturePageProps) {
  // Memoised: an unmemoised service would be a new object every render, retrigger `useDispute`'s
  // load effect, and ping-pong the page forever.
  const service = useMemo(() => props.service ?? createFixtureService(), [props.service]);
  const principal = props.principal ?? FIXTURE_BUYER;
  return createElement(DisputePage, {
    route: props.route,
    service,
    principal,
    ...(props.orderId === undefined ? {} : { orderId: props.orderId }),
  });
}

export { DisputePage } from './dispute-page.js';
export { createFixtureService } from './api/fixtures.js';
export type { DisputePrincipal, DisputeService } from './api/dispute-transport.js';
