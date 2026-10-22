import type { RouteDef } from '../router.js';

/** Wired by the web-staff wave; budget class 'scene'. */
export default function CaptureQc({ route }: { route: RouteDef }) {
  return (
    <section>
      <h1>{route.label}</h1>
      <p>Capture QC — not yet implemented.</p>
    </section>
  );
}
