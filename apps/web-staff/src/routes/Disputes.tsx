import type { RouteDef } from '../router.js';

/** Wired by the web-staff wave; budget class 'app'. */
export default function Disputes({ route }: { route: RouteDef }) {
  return (
    <section>
      <h1>{route.label}</h1>
      <p>Disputes — not yet implemented.</p>
    </section>
  );
}
