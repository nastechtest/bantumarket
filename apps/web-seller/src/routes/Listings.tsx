import type { RouteDef } from '../router.js';

/** Wired by the web-seller wave; budget class 'app'. */
export default function Listings({ route }: { route: RouteDef }) {
  return (
    <section>
      <h1>{route.label}</h1>
      <p>My listings — not yet implemented.</p>
    </section>
  );
}
