import type { RouteDef } from '../router.js';

/** Wired by the web-seller wave; budget class 'app'. */
export default function ListingDetail({ route }: { route: RouteDef }) {
  return (
    <section>
      <h1>{route.label}</h1>
      <p>Listing — not yet implemented.</p>
    </section>
  );
}
