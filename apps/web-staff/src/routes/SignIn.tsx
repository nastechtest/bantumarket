import type { RouteDef } from '../router.js';
import AuthPage from '../features/auth/index.js';

/** Route class `critical`: sign-in may never reach the scene runtime. */
export default function SignIn({ route }: { route: RouteDef }) {
  return <AuthPage route={route} />;
}
