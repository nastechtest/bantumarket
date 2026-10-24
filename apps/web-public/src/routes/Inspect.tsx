import type { RouteDef } from '../router.js';
import { Page as InspectPage } from '../features/inspect/index.js';

/**
 * Route entry for `/item/:id/inspect` (class `scene`).
 *
 * It is a thin shell over the inspect feature so this module — the one the router dynamic-imports for
 * the scene route — holds no scene imports of its own. The WebGL runtime is reached further down, only
 * through `features/inspect/inspect-page.tsx`'s lazy `import('./scene-mount.js')`, which is what lets
 * the fence treat the item page as reaching the scene by navigation and nothing else.
 */
export default function Inspect({ route }: { route: RouteDef }) {
  return <InspectPage route={route} />;
}
