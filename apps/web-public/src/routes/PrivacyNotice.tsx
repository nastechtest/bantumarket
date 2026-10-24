import type { RouteDef } from '../router.js';
import { PrivacyNotice } from '../features/legal/index.js';

/**
 * `/privacy-notice` — the consent banner's default href. It renders the same notice as
 * `/legal/privacy` through a distinct route module, so the route table keeps one page per route.
 */
export default function PrivacyNoticeAlias({ route }: { route: RouteDef }) {
  return (
    <div data-page={route.path}>
      <PrivacyNotice />
    </div>
  );
}
