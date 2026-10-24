import type { RouteDef } from '../router.js';
import { PrivacyNotice as PrivacyNoticePage } from '../features/legal/index.js';

/** `/legal/privacy` — first-paint public policy surface linked from the footer and auth screens. */
export default function LegalPrivacy({ route }: { route: RouteDef }) {
  return (
    <div data-page={route.path}>
      <PrivacyNoticePage />
    </div>
  );
}
