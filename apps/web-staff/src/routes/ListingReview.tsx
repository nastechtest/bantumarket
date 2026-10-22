import type { RouteDef } from '../router.js';

/** Wired by the web-staff wave; budget class 'app'. */
export default function ListingReview({ route }: { route: RouteDef }) {
  return (
    <section>
      <h1>{route.label}</h1>
      <p>Listing review — not yet implemented.</p>
    </section>
  );
}
