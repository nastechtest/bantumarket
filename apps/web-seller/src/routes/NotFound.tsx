import type { RouteDef } from '../router.js';

/** Wired by the web-seller wave; budget class 'app'. */
export default function NotFound({ route }: { route: RouteDef }) {
  return (
    <section>
      <h1>{route.label}</h1>
      <p>Not found — not yet implemented.</p>
    </section>
  );
}
