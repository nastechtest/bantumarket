import type { RouteDef } from '../router.js';

/** Wired by the web-seller wave; budget class 'app'. */
export default function SaleDetail({ route }: { route: RouteDef }) {
  return (
    <section>
      <h1>{route.label}</h1>
      <p>Sale — not yet implemented.</p>
    </section>
  );
}
