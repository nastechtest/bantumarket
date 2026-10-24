import type { RouteDef } from '../router.js';
import { TermsOfSale } from '../features/legal/index.js';

/** `/legal/terms` — first-paint public policy surface linked from the footer and checkout. */
export default function LegalTerms({ route }: { route: RouteDef }) {
  return (
    <div data-page={route.path}>
      <TermsOfSale />
    </div>
  );
}
