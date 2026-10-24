import type { RouteDef } from '../router.js';
import { ReturnsPolicy } from '../features/legal/index.js';

/** `/legal/returns` — first-paint public policy surface linked from every checkout footer. */
export default function LegalReturns({ route }: { route: RouteDef }) {
  return (
    <div data-page={route.path}>
      <ReturnsPolicy />
    </div>
  );
}
