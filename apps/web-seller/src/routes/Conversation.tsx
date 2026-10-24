import { stripBase, type RouteDef } from '../router.js';
import { pathParam } from '../lib/path-param.js';
import { ConversationPage } from '../features/messages/conversation-page.js';

/** `/messages/:threadId` — class `app`. */
export default function Conversation({ route }: { route: RouteDef }) {
  const pathname = typeof window === 'undefined' ? '' : stripBase(window.location.pathname);
  return <ConversationPage threadId={pathParam(route.path, 'threadId', pathname)} />;
}
