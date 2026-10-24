/**
 * Critical route (router class 'critical'): the 3D fence (scripts/check-3d-boundaries.ts) must
 * find no path — static or dynamic — from this file to `three`, `@react-three/*` or
 * `@nastech/ui-3d/*`, and signin.test.tsx re-checks the subtree's import graph on every test run,
 * because the fence's route table doesn't know our assumed paths yet.
 *
 * Everything about this page is sized for a 3G connection and a $100 Android: text, one input at
 * a time, native form controls, no images, and no component that needs more JS than the answer.
 */
import type { RouteDef } from '../router.js';
import AuthPage from '../features/auth/index.js';

export default function SignIn({ route }: { route: RouteDef }) {
  return <AuthPage route={route} />;
}
