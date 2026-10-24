/**
 * The session hook. Its one job beyond convenience: no consumer may ever render "signed in" from
 * client state alone. `status === 'authenticated'` is only ever set after `api.getSession()` said
 * so — on mount, on adoption of a fresh login, and on tab re-visibility. A hint persisted from a
 * previous visit is enough to say "Continue as 082 •• 67?", never enough to say who you are.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { isAuthError, type AuthApi, type AuthErrorCode, type SessionInfo } from './api/auth-transport.js';
import { createSessionStore, webKeyValues, type PublicSessionHint, type SessionStore } from './session-storage.js';

export type SessionStatus = 'checking' | 'anonymous' | 'authenticated' | 'error';

export interface UseSessionResult {
  readonly status: SessionStatus;
  readonly session: SessionInfo | null;
  /** Last known non-secret display hint; safe to render, never safe to trust. */
  readonly hint: PublicSessionHint | null;
  readonly errorCode: AuthErrorCode | null;
  refresh(): void;
  /** Call only with a SessionInfo that just came back from the server (verify/register/login). */
  adopt(session: SessionInfo): void;
  signOut(): Promise<void>;
}

export function useSession(api: AuthApi, store: SessionStore = createSessionStore(webKeyValues())): UseSessionResult {
  const [status, setStatus] = useState<SessionStatus>('checking');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(null);
  const hint = store.readHint();
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const verify = useCallback(async () => {
    try {
      const fresh = await api.getSession();
      if (!aliveRef.current) return;
      setErrorCode(null);
      if (fresh === null) {
        setStatus('anonymous');
        setSession(null);
        store.clear();
      } else {
        setStatus('authenticated');
        setSession(fresh);
        store.writeHint(fresh, Date.now());
      }
    } catch (e) {
      if (!aliveRef.current) return;
      // A failed check is not an anonymous session: the buyer may be signed in and offline.
      // Rendering "sign in" over a live session loses trust; rendering 'error' with a retry loses nothing.
      setStatus('error');
      setErrorCode(isAuthError(e) ? e.code : 'server');
    }
  }, [api, store]);

  useEffect(() => {
    void verify();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void verify();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [verify]);

  const adopt = useCallback(
    (s: SessionInfo) => {
      store.writeHint(s, Date.now());
      setSession(s);
      setStatus('authenticated');
      setErrorCode(null);
    },
    [store],
  );

  const signOut = useCallback(async () => {
    await api.endSession();
    store.clear();
    setSession(null);
    setStatus('anonymous');
  }, [api, store]);

  return { status, session, hint, errorCode, refresh: () => void verify(), adopt, signOut };
}
