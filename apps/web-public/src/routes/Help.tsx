import type { RouteDef } from '../router.js';
import { HelpCentre } from '../features/help/index.js';

/** `/help` — first-paint. Fees and capture in ZAR, plus the handover explanation. */
export default function Help({ route }: { route: RouteDef }) {
  return (
    <div data-page={route.path}>
      <HelpCentre />
    </div>
  );
}
