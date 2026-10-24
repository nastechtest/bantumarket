import type { RouteDef } from '../router.js';

/**
 * The `*` route: echoes the path that missed and offers the way back. No new routes, no request —
 * a wrong address should cost a paint, not a query.
 */
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
        . No queue, case or audit entry changed because of it.
      </p>
      <p>
        <a href="/">Back to operations</a>
      </p>
    </section>
  );
}
