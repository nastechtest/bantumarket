import type { RouteDef } from '../router.js';

/** Wired by the web-staff wave; budget class 'app'. */
export default function CaptureOps({ route }: { route: RouteDef }) {
  return (
    <section>
      <h1>{route.label}</h1>
      <p>Capture programme — not yet implemented.</p>
    </section>
  );
}
