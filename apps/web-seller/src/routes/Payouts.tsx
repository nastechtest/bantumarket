import type { RouteDef } from '../router.js';

/** Wired by the web-seller wave; budget class 'critical'. */
export default function Payouts({ route }: { route: RouteDef }) {
  return (
    <section>
      <h1>{route.label}</h1>
      <p>Payouts — not yet implemented.</p>
    </section>
  );
}
