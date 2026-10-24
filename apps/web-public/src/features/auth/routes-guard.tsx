import type { ReactNode } from 'react';
import { useSession } from './use-session.js';
import { SigninPage } from './signin-page.js';
import { createFakeAuthApi } from './api/fixtures.js';
import type { AuthApi } from './api/auth-transport.js';
import { S } from './styles.js';

const fixtureFallback = createFakeAuthApi();

export interface RequireSessionProps {
  children: ReactNode;
  api?: AuthApi;
  /** Rendered instead of the sign-in form when the host wants a custom prompt. */
  fallback?: ReactNode;
  label?: string;
}

/**
 * Session gate for authenticated surfaces.
 *
 * The gate is a *re-verification*, not a flag read: `useSession` asks the server every mount, so
 * a session ended elsewhere (account page, stolen-phone revoke) means this gate closes the door
 * on the next mount or tab re-focus, not "whenever localStorage feels like it". While checking,
 * it renders a quiet sentence and no form — flashing "Sign in" to a signed-in user is how you
 * train people to distrust the app.
 */
export function RequireSession({ children, api = fixtureFallback.api, fallback, label = 'Sign in to continue' }: RequireSessionProps) {
  const { status, hint, errorCode, adopt } = useSession(api);

  if (status === 'checking') {
    return (
      <div style={S.page} data-testid="guard-checking">
        <p style={S.p}>Checking your session…</p>
      </div>
    );
  }

  if (status === 'authenticated') return <>{children}</>;

  if (fallback !== undefined) return <>{fallback}</>;

  return (
    <div style={S.page} data-testid="guard-signin">
      <h2 style={S.h1}>{label}</h2>
      {status === 'error' ? (
        <p role="alert" style={S.alert} data-testid="guard-error">
          {errorCode === 'network'
            ? 'We could not reach the server to confirm your session. Retry — we will not show you signed-in screens on a guess.'
            : 'Session check failed. Try again.'}
        </p>
      ) : null}
      {hint?.e164Masked !== undefined ? <p style={S.p}>Last used: {hint.e164Masked}</p> : null}
      <SigninPage api={api} compact onAuthenticated={adopt} />
    </div>
  );
}
