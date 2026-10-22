import type { RouteDef } from '../router.js';

/** Wired by the web-seller wave; budget class 'scene'. */
export default function CapturePreview({ route }: { route: RouteDef }) {
  return (
    <section>
      <h1>{route.label}</h1>
      <p>Capture preview — not yet implemented.</p>
    </section>
  );
}
