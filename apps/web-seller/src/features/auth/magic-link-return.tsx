import { useEffect, useRef, useState } from 'react';
import { navigate } from '../../router.js';
import type { AuthTransport } from './api/auth-transport.js';
import { AuthError, AUTH_ERROR_COPY } from './api/auth-transport.js';
import { writeSellerSession, type KeyValueStore, type SellerSession } from './session.js';

/**
 * The magic-link landing (`/sign-in?token=…` or `#ml=…`). The token is read once, sent once, and
 * never rendered, stored or logged: replaying a link is the classic way an emailed credential
 * leaks through a screenshot.
 */

export function magicTokenFromLocation(href: string): string | null {
  try {
    const url = new URL(href);
    const fromQuery = url.searchParams.get('token');
    if (fromQuery !== null && fromQuery.length > 0) return fromQuery;
    if (url.hash.startsWith('#ml=')) {
      const token = decodeURIComponent(url.hash.slice(4));
      return token.length > 0 ? token : null;
    }
    return null;
  } catch {
    return null;
  }
}

export interface MagicLinkReturnProps {
  readonly transport: AuthTransport;
  readonly href?: string;
  readonly navigateTo?: (path: string) => void;
  readonly store?: KeyValueStore | null;
}

type LinkState = 'verifying' | 'error' | 'success';

export function MagicLinkReturn({ transport, href, navigateTo = navigate, store }: MagicLinkReturnProps) {
  const [state, setState] = useState<LinkState>('verifying');
  const [message, setMessage] = useState<string>('');
  const [session, setSession] = useState<SellerSession | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const token = magicTokenFromLocation(href ?? (typeof window === 'undefined' ? '' : window.location.href));

  useEffect(() => {
    if (token === null) {
      setState('error');
      setMessage(AUTH_ERROR_COPY.link_expired);
      return;
    }
    let cancelled = false;
    transport.verifyLink(token).then(
      (signedIn) => {
        if (cancelled) return;
        writeSellerSession(signedIn, store === undefined ? undefined : store);
        setSession(signedIn);
        setState('success');
      },
      (error: unknown) => {
        if (cancelled) return;
        setState('error');
        setMessage(error instanceof AuthError ? error.message : AUTH_ERROR_COPY.network);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [transport, token, store]);

  useEffect(() => {
    if (state === 'error') summaryRef.current?.focus();
  }, [state]);

  if (state === 'verifying') {
    return (
      <section aria-busy="true" style={{ maxWidth: 460, margin: '0 auto', paddingTop: '32px' }}>
        <h1>Signing you in…</h1>
        <p role="status" style={{ color: 'var(--ink-500)' }}>
          This takes a second. Do not close the tab.
        </p>
      </section>
    );
  }

  if (state === 'error') {
    return (
      <section style={{ maxWidth: 460, margin: '0 auto', paddingTop: '32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h1>That link did not work</h1>
        <div role="alert" tabIndex={-1} ref={summaryRef} data-testid="magic-link-error">
          {message}
        </div>
        <p style={{ margin: 0, color: 'var(--ink-500)' }}>
          Links expire after one use and ten minutes. A code sent to your phone is the fastest way back in.
        </p>
        <a className="button" href="/sign-in">
          Sign in with a code
        </a>
      </section>
    );
  }

  return (
    <section style={{ maxWidth: 460, margin: '0 auto', paddingTop: '32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <h1>You are signed in</h1>
      <p style={{ margin: 0 }}>
        {session?.displayName ? `Welcome back, ${session.displayName}.` : 'Welcome back.'} The link has been used and cannot be used again.
      </p>
      <button type="button" onClick={() => navigateTo('/')}>
        Continue to your dashboard
      </button>
    </section>
  );
}
