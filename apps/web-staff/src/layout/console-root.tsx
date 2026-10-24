import { App, useRoute } from '../router.js';
import { useStaffSession } from '../shell/use-staff-session.js';
import { ConsoleFrame } from './console-frame.js';

// CONTRACT-GAP: sign-out and end-impersonation controls (features/auth, brief 60) have no export
// yet. ConsoleFrame exposes `navFooter` and `actions` slots for them; ConsoleRoot leaves both empty
// rather than invent a second auth surface.
export function ConsoleRoot() {
  const route = useRoute();
  const session = useStaffSession();
  return (
    <ConsoleFrame route={route} session={session}>
      <App />
    </ConsoleFrame>
  );
}
