import type { RouteDef } from '../router.js';

/** Wired by the web-seller wave; budget class 'critical'. */
export default function Settings({ route }: { route: RouteDef }) {
  return (
    <section>
      <h1>{route.label}</h1>
      <p>Settings — not yet implemented.</p>
    </section>
  );
}
