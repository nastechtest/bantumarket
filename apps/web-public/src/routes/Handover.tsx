import type { RouteDef } from '../router.js';
import { RequireSession } from '../features/auth/routes-guard.js';
import HandoverFeature from '../features/handover/index.js';

/**
 * Critical route: the in-person exchange screen. No scene, no WebGL, no animation library —
 * not even lazily: `scripts/check-3d-boundaries.ts` fails the build if this file's graph
 * reaches the runtime by any import shape, and the graph below is deliberately dull.
 *
 * The thin wrapper exists so the fence's entry point is this route file, and the feature is
 * swappable behind the wave-b page contract (`Page({ route })`).
 */
export default function Handover({ route }: { route: RouteDef }) {
  // Gated: the six-digit code only ever means "I was really here" if the screen showing it is
  // bound to one identified party, so an anonymous visitor is asked to sign in first.
  return (
    <RequireSession label="Sign in to open the exchange">
      <HandoverFeature route={route} />
    </RequireSession>
  );
}
