import type { RouteDef } from '../router.js';
import { MessagesPage } from '../features/messages/messages-page.js';

/** `/messages` — class `app`. */
export default function Messages({ route }: { route: RouteDef }) {
  void route;
  return <MessagesPage />;
}
