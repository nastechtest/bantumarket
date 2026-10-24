import type { RouteDef } from '../router.js';
import { SellLanding } from '../features/sell/index.js';

/** `/sell` — brand landing page: the capture cost and the break-even price, no form. */
export default function Sell({ route }: { route: RouteDef }) {
  return (
    <div data-page={route.path}>
      <SellLanding />
    </div>
  );
}
