import type { RouteDef } from '../router.js';

/** Wired by the web-staff wave; budget class 'critical'. */
export default function SignIn({ route }: { route: RouteDef }) {
  return (
    <section>
      <h1>{route.label}</h1>
      <p>Sign in — not yet implemented.</p>
    </section>
  );
}
