import type { RouteDef } from '../router.js';
import Page from '../features/auth/index.js';

/** `/sign-in` — class `critical`. */
export default function SignInRoute({ route }: { route: RouteDef }) {
  return <Page route={route} />;
}
