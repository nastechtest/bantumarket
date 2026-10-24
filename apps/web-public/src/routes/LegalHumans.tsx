import type { RouteDef } from '../router.js';
import { HumansPage } from '../features/legal/index.js';

/** `/legal/humans` — first-paint. The footer's “Team” link lands on roles, not invented people. */
export default function LegalHumans({ route }: { route: RouteDef }) {
  return (
    <div data-page={route.path}>
      <HumansPage />
    </div>
  );
}
