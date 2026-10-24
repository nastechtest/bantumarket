import { stripBase, type RouteDef } from '../router.js';
import { NotFoundPage } from '../features/not-found/not-found-page.js';

/** `*` — class `app`. Shows the requested path and real recovery destinations. */
export default function NotFound({ route }: { route: RouteDef }) {
  void route;
  const pathname = typeof window === 'undefined' ? '/' : stripBase(window.location.pathname);
  return <NotFoundPage path={pathname} />;
}
