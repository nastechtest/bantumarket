import type { RouteDef } from '../router.js';

/** Wired by the web-staff wave; budget class 'critical'. */
export default function Audit({ route }: { route: RouteDef }) {
  return (
    <section>
      <h1>{route.label}</h1>
      <p>Audit trail — not yet implemented.</p>
    </section>
  );
}
