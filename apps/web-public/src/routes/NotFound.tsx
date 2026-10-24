/**
 * The `*` route: first-paint class, so it imports nothing beyond the router's type and renders
 * only text and one link. The path a person asked for is echoed back, because the useful question
 * at this moment is "what did I type?" — `RouteDef` for `*` carries the pattern, not the concrete
 * path, so the path comes from the location the router resolved.
 */
import type { RouteDef } from '../router.js';

export default function NotFound({ route }: { route: RouteDef }) {
  const asked = typeof window === 'undefined' ? '' : window.location.pathname;
  return (
    <section>
      <h1>{route.label}</h1>
      <p>
        That page is not here
        {asked === '' ? null : (
          <>
            {' '}— we looked for <code>{asked}</code>
          </>
        )}
        . Nothing about an item, an order or your money moved because of it.
      </p>
      <p>
        <a href="/">Back to the market</a>
      </p>
    </section>
  );
}
