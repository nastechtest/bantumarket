import type { RouteDef } from '../router.js';
import { SettingsPage } from '../features/settings/settings-page.js';

/** `/settings` — class `critical`. The shell refuses the page without a seller session. */
export default function Settings({ route }: { route: RouteDef }) {
  void route;
  return <SettingsPage />;
}
