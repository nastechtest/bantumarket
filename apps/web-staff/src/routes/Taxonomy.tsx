import type { RouteDef } from '../router.js';

/** Wired by the web-staff wave; budget class 'app'. */
export default function Taxonomy({ route }: { route: RouteDef }) {
  return (
    <section>
      <h1>{route.label}</h1>
      <p>Catalogue — not yet implemented.</p>
    </section>
  );
}
