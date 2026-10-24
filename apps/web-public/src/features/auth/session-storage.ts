/**
 * Session storage — the minimum, and in the right place.
 *
 * Posture (this is the whole point of the file):
 * - The session token is NEVER persisted to localStorage / sessionStorage. If the Identity
 *   transport is cookie-backed (http-only, SameSite=Lax — the assumed shape, see
 *   api/auth-transport.ts CONTRACT-GAP notes), the browser holds the credential and this client
 *   holds nothing secret at all. If it is bearer-backed, the token lives in this module's memory
 *   only: a page refresh loses it and the session must be re-verified with the server before any
 *   screen claims the buyer is signed in. That is the cost of no http-only cookie, paid honestly.
 * - What IS persisted is a non-secret display hint: the opaque session id, a masked phone number,
 *   and a timestamp. It renders "Continue as 082 •• 67?" faster on a 3G phone. It is never
 *   treated as proof of authentication — `use-session.ts` re-questions the server every time.
 */

import { maskPhone } from './phone.js';

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function memoryKeyValues(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => {
      map.set(k, v);
    },
    remove: (k) => {
      map.delete(k);
    },
  };
}

/** Guarded so SSR/renderToStaticMarkup and privacy-mode WebViews without storage don't throw. */
export function webKeyValues(): KeyValueStore {
  try {
    const ls = window.localStorage;
    const probe = 'nastech.probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      get: (k) => ls.getItem(k),
      set: (k, v) => ls.setItem(k, v),
      remove: (k) => ls.removeItem(k),
    };
  } catch {
    return memoryKeyValues();
  }
}

export interface PublicSessionHint {
  readonly sessionId: string;
  /** Masked at write time, so even the hint is not personal information in plaintext. */
  readonly e164Masked?: string;
  readonly updatedAtMs: number;
}

const KEY = 'nastech.sessionhint.v1';

export interface SessionStore {
  readHint(): PublicSessionHint | null;
  /** Accepts the full session shape but persists strictly the fields above. */
  writeHint(session: { sessionId: string; e164?: string }, nowMs: number): void;
  clear(): void;
  /** Bearer fallback only. Memory-only by construction: no store, no persist, cleared on clear(). */
  setAccessToken(token: string | null): void;
  accessToken(): string | null;
}

export function createSessionStore(backing: KeyValueStore = memoryKeyValues()): SessionStore {
  // Deliberately a closure variable, not the backing store: see the header. A refresh must not
  // resurrect a bearer token; it must force a server re-verification instead.
  let accessToken: string | null = null;

  return {
    readHint() {
      const raw = backing.get(KEY);
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw) as Partial<PublicSessionHint>;
        if (typeof parsed.sessionId !== 'string' || typeof parsed.updatedAtMs !== 'number') return null;
        return {
          sessionId: parsed.sessionId,
          updatedAtMs: parsed.updatedAtMs,
          ...(typeof parsed.e164Masked === 'string' ? { e164Masked: parsed.e164Masked } : {}),
        };
      } catch {
        return null;
      }
    },
    writeHint(session, nowMs) {
      const hint: PublicSessionHint = {
        sessionId: session.sessionId,
        ...(session.e164 !== undefined ? { e164Masked: maskPhone(session.e164) } : {}),
        updatedAtMs: nowMs,
      };
      backing.set(KEY, JSON.stringify(hint));
    },
    clear() {
      backing.remove(KEY);
      accessToken = null;
    },
    setAccessToken(token) {
      accessToken = token;
    },
    accessToken() {
      return accessToken;
    },
  };
}
