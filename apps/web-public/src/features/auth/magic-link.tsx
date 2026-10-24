import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { TextField } from '@nastech/design-system';
import { emailError, goTo } from './fields.js';
import { isAuthError, type AuthApi } from './api/auth-transport.js';
import { S, buttonStyle } from './styles.js';

/**
 * Magic link, as a secondary path only.
 *
 * The security shape, stated plainly:
 * - The token must never sit in a query string: query strings land in access logs, proxy logs and
 *   browser history on shared phones. It is delivered as a link to `/sign-in#ml=<token>` — a URL
 * *fragment*, which browsers do not send to servers — and the fragment is erased from the address
 * bar the moment it is read. A shoulder-surfing neighbour sees `#ml=…` for a fraction of a second,
 * which is why SMS OTP remains the primary path and this page tells the truth about the difference.
 * - Tokens are one-time and short-lived; a used or expired token gives a fixed message that does
 *   not say which of the two it was.
 * - Requesting a link answers the same way whether the email exists or not.
 */

export interface MagicLinkRequestProps {
  api: AuthApi;
  onBack?: (() => void) | undefined;
}

export function MagicLinkRequest({ api, onBack }: MagicLinkRequestProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const err = emailError(email);
    if (err !== undefined || email.trim() === '') {
      setError(err ?? 'Enter the email on your account.');
      return;
    }
    setBusy(true);
    try {
      await api.requestMagicLink({ email: email.trim() });
      setSent(true); // truthful regardless of account existence — the transport never says which
    } catch {
      setError('Could not send right now. Try the texted code instead.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.page.gap }} data-testid="magic-sent">
        <h2 style={S.h1}>Check your email</h2>
        <p style={S.p}>
          If an account uses that email, a sign-in link is on its way. It works once and stops
          working in 10 minutes. On a shared phone, do not leave the inbox open while you tap it.
        </p>
        <button type="button" style={buttonStyle(true)} onClick={() => goTo('/sign-in')} data-testid="magic-back">
          Back to sign in
        </button>
        {onBack ? <button type="button" onClick={onBack} style={S.linkish}>Sign in with a code instead</button> : null}
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} style={{ display: 'flex', flexDirection: 'column', gap: S.page.gap }} data-testid="magic-request">
      <h2 style={S.h1}>Email me a sign-in link</h2>
      <p style={S.p}>Slower and easier to snoop than a texted code — use it only when SMS is not available to you.</p>
      <TextField
        id="magic-email"
        label="Email address"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(v) => {
          setEmail(v);
          setError(undefined);
        }}
        {...(error !== undefined ? { error } : {})}
      />
      <button type="submit" disabled={busy} style={buttonStyle(!busy)}>
        {busy ? 'Sending…' : 'Send the link'}
      </button>
      {onBack ? <button type="button" onClick={onBack} style={S.linkish}>Back — use a code</button> : null}
    </form>
  );
}

const HASH_TOKEN_RE = /[#&]ml=([A-Za-z0-9._~-]{8,})/;

export interface MagicLinkConsumerProps {
  api: AuthApi;
  onVerified: (session: import('./api/auth-transport.js').SessionInfo) => void;
}

/**
 * Reads `#ml=<token>` from the fragment exactly once, erases it from the address bar before any
 * await can let a screenshot or bystander catch it, and POSTs it. Never renders the token.
 */
export function MagicLinkConsumer({ api, onVerified }: MagicLinkConsumerProps) {
  const [state, setState] = useState<'consum' | 'ok' | 'invalid' | 'error'>('consum');
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    const match = window.location.hash.match(HASH_TOKEN_RE);
    // Strip first, ask questions after: the token should not sit in history even for a second.
    window.history.replaceState({}, '', window.location.pathname + window.location.search);
    if (match === null || match[1] === undefined) {
      setState('invalid');
      return;
    }
    const token = match[1];
    void (async () => {
      try {
        const { session } = await api.consumeMagicLink({ token });
        onVerified(session);
        setState('ok');
      } catch (e) {
        setState(isAuthError(e) && e.code === 'magic_token_invalid' ? 'invalid' : 'error');
      }
    })();
  }, [api, onVerified]);

  return (
    <div data-testid="magic-consumer" style={{ display: 'flex', flexDirection: 'column', gap: S.page.gap }}>
      {state === 'consum' || state === 'ok' ? <p style={S.p}>Signing you in with your link…</p> : null}
      {(state === 'invalid' || state === 'error') && (
        <>
          <h2 style={S.h1}>That link did not work</h2>
          <p style={S.p}>
            Sign-in links work once and expire in 10 minutes. Request a new one, or use the code
            sent by SMS.
          </p>
          <button type="button" style={buttonStyle(true)} onClick={() => goTo('/sign-in')}>
            Back to sign in
          </button>
        </>
      )}
    </div>
  );
}
