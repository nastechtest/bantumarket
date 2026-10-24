import type { RouteDef } from '../router.js';
import { OnboardingPage } from '../features/onboarding/onboarding-page.js';

/** `/onboarding` — class `app`. */
export default function Onboarding({ route }: { route: RouteDef }) {
  void route;
  return <OnboardingPage />;
}
