/**
 * The rotating session id — and the reasons it is not a fingerprint.
 *
 * What it is: a 24-character value drawn from a CSPRNG, kept in session storage (so it dies when the
 * tab closes), rotated whenever the consent state changes or the session ages out, and never derived
 * from anything about the device.
 *
 * Why that is *not* a fingerprint, which is the claim this file has to be able to defend:
 *
 *  1. **Nothing about the device enters the value.** The dependency interface is `{ storage, random,
 *     now }` — there is no channel through which a user agent, screen size, font list, hardware
 *     concurrency, timezone, canvas hash or WebGL renderer string could reach the id.
 *     `session.test.ts` asserts the interface is exactly that, which is the strongest available form
 *     of "we don't read it": a test on the shape of the dependency object, not on the absence of a call.
 *  2. **It is not stable.** Persistence across contexts is what a fingerprint *is*. This id changes
 *     when the tab closes, when consent changes, when consent is withdrawn, and after 30 minutes
 *     idle or 3 hours of life. Nothing in the app can legitimately join two of its own sessions, so
 *     a long-term profile cannot be assembled from analytics rows alone.
 *  3. **It is not sent as an identity claim.** Its two jobs are to bound a funnel to one person's
 *     actions in one sitting, and to salt the correlation refs, so `listing_ref` values cannot be
 *     joined across sessions either.
 *  4. **Refusal changes nothing about the algorithm.** If `random` is unavailable we do not fall back
 *     to `Math.random()`, a timestamp, a UA hash or `navigator` — the tracker goes dark. A degraded
 *     entropy source is how a "random id" quietly becomes an enumerable one.
 *
 * What *would* turn this into a fingerprint, written down so a reviewer can check for it instead of
 * trusting this comment:
 *  · deriving the id from any device signal — hashing it still counts, a hash of a fingerprint is a fingerprint;
 *  · persisting it somewhere that survives a consent withdrawal or a browser restart;
 *  · accepting a caller-supplied id, so a third-party script could hand one in;
 *  · emitting the previous id alongside a rotation, which links the old rows to the new ones and
 *    silently extends the lifetime we just ended;
 *  · letting the server key analytics rows by IP address and join across sessions. That is out of
 *    this file's control, so it is a stated server constraint: recorded in the README and asserted
 *    of the transport payload in `transport.ts`, which carries no ip, no ua and no cookie.
 */
import type { ConsentStorage } from '../../lib/consent/types.js';
import { SESSION_ROTATION_REASONS } from './events.js';

/** 24 characters of lowercase base32 = 120 bits, no case ambiguity, no padding to strip. */
export const SESSION_ID_LENGTH = 24;
export const REF_LENGTH = 24;
/** Bytes behind the per-session ref salt: it dies with the session, so a ref is never a join key. */
export const REF_SALT_LENGTH = 24;

/** RFC 4648 base32, lowercase, no padding: a–z plus 2–7. */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
/** Refs and ids must start with a letter so a value can never be mistaken for a number downstream. */
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

export const IDLE_ROTATE_MS = 30 * 60 * 1000;
export const MAX_SESSION_MS = 3 * 60 * 60 * 1000;
/** Writing `lastSeenAt` on every event would be a storage hit per row; 60 s is smooth enough. */
const TOUCH_PERSIST_MS = 60 * 1000;

export const SESSION_STORAGE_KEY = 'ntm.session.v1';

/**
 * Exactly the three dependencies the id can come from. Widening this interface is the moment this
 * file stops being defensible, so it is asserted by name in `session.test.ts`.
 */
export interface SessionDeps {
  readonly storage: ConsentStorage;
  /** CSPRNG: must return `count` unbiased bytes, or `null` when the platform has none. */
  readonly random: (count: number) => Uint8Array | null;
  readonly now: () => number;
  readonly idleRotateMs?: number;
  readonly maxSessionMs?: number;
}

export interface SessionState {
  readonly id: string;
  /** Monotonic per rotation, carried on every envelope so a row proves *which* id it was written under. */
  readonly epoch: number;
  /** Per-session salt for correlation refs. Never leaves the device. */
  readonly refSalt: string;
  readonly startedAt: number;
  readonly lastSeenAt: number;
  /** The consent record version this id was created under — the "scoped to this consent state" clause. */
  readonly consentVersion: number;
}

/** The rotation vocabulary is the `session_rotated` event's enum, imported rather than mirrored. */
export type RotationReason = (typeof SESSION_ROTATION_REASONS)[number];

export interface SessionSnapshot {
  readonly state: SessionState | null;
  /** False when entropy was unavailable: the tracker must then send nothing at all. */
  readonly available: boolean;
}

export interface SessionManager {
  /** Called before every emit; performs idle/max-age rotation itself so a long-lived page cannot drift. */
  current(): SessionSnapshot;
  /**
   * Bind the id to the consent state. Passing the current record version rotates when it differs
   * from the version the id was minted under — that is what makes the id *scoped to consent state*
   * rather than merely stored near it.
   */
  bindConsent(consentVersion: number, reason: RotationReason): SessionSnapshot;
  rotate(reason: RotationReason): SessionSnapshot;
  /** The reason of the rotation that happened since the last drain, or null. Drained once, so `session_rotated` cannot double-emit. */
  drainRotation(): RotationReason | null;
  /**
   * A session-scoped correlation ref for an entity id: a keyed digest under the session salt,
   * truncated to 24 base32 chars. Same session → joinable across events; next session →
   * unrecognisable. This is the mechanism that lets a funnel be computed without an id that outlives it.
   */
  refFor(kind: 'listing' | 'order', entityId: string): string | null;
  /** For the age bucket on `session_rotated`; no absolute timestamp is ever emitted. */
  ageMs(): number;
  reset(): void;
}

/* ------------------------------------------------------------------ primitives */

function charAt(alphabet: string, index: number): string {
  const ch = alphabet.charAt(index % alphabet.length);
  if (ch === '') throw new RangeError('session: alphabet index produced no character');
  return ch;
}

/** Draw `length` characters from `count` random bytes, rejecting nothing and biasing minimally. */
function encodeRandom(bytes: Uint8Array, length: number, alphabet: string): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    // Two bytes per character is 16 bits of index space for a 32-symbol alphabet: the modulo bias is
    // 2^-11 per symbol, and the value is a random label rather than a security token, so this is the
    // honest trade against drawing exactly-multiple-of-5-bit chunks and re-drawing on rejection.
    const hi = bytes[i % bytes.length] ?? 0;
    const lo = bytes[(i + 1) % bytes.length] ?? 0;
    out += charAt(alphabet, (hi << 8) | lo);
  }
  return out;
}

function fnv1a32(input: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= (input.charCodeAt(i) & 0xff) | ((input.charCodeAt(i) >> 8) << 8);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * A tiny keyed digest, deliberately not a crypto dependency.
 *
 * It is not a security primitive and does not claim to be one: the salt is 120 bits and random, the
 * input is an internal entity id, and the requirement is only that the output is (a) stable within a
 * session and (b) not computable from the input without the salt. A truncated keyed mixing function
 * gives both. The honest alternative is `crypto.subtle`'s HMAC, which is async and would push every
 * `track()` call site into promise-land; that tradeoff is recorded here rather than hidden, and
 * `session.test.ts` asserts the property that actually matters — no salt, no reproducible ref.
 */
function keyedDigest(salt: string, input: string, length: number): string {
  let out = charAt(LETTERS, fnv1a32(`s=${salt}`, 0x811c9dc5));
  let h = fnv1a32(`salt:${salt}|in:${input}`, 0x811c9dc5);
  for (let i = 1; i < length; i++) {
    h = fnv1a32(`${h.toString(36)}|${i}|${input}|${salt}`, h);
    out += charAt(ALPHABET, h);
  }
  return out;
}

/* ------------------------------------------------------------------ persistence */

interface StoredSession {
  readonly v: 1;
  readonly id: string;
  readonly epoch: number;
  readonly refSalt: string;
  readonly startedAt: number;
  readonly lastSeenAt: number;
  readonly consentVersion: number;
}

function parseStored(raw: string | null): StoredSession | null {
  if (raw === null || raw.length === 0) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const s = value as Record<string, unknown>;
  if (s.v !== 1) return null;
  if (typeof s.id !== 'string' || s.id.length !== SESSION_ID_LENGTH) return null;
  if (typeof s.refSalt !== 'string' || s.refSalt.length < 16) return null;
  for (const key of ['epoch', 'startedAt', 'lastSeenAt', 'consentVersion'] as const) {
    if (typeof s[key] !== 'number' || !Number.isFinite(s[key]) || (s[key] as number) < 0) return null;
  }
  return {
    v: 1,
    id: s.id,
    epoch: s.epoch as number,
    refSalt: s.refSalt,
    startedAt: s.startedAt as number,
    lastSeenAt: s.lastSeenAt as number,
    consentVersion: s.consentVersion as number,
  };
}

/* ------------------------------------------------------------------ manager */

export function createSessionManager(deps: SessionDeps): SessionManager {
  const idleMs = deps.idleRotateMs ?? IDLE_ROTATE_MS;
  const maxMs = deps.maxSessionMs ?? MAX_SESSION_MS;

  let state: SessionState | null = null;
  let pendingRotation: RotationReason | null = null;
  let entropyFailed = false;

  function mint(reason: RotationReason, consentVersion: number): SessionState | null {
    const bytes = deps.random(SESSION_ID_LENGTH);
    const saltBytes = deps.random(REF_SALT_LENGTH);
    if (bytes === null || saltBytes === null || bytes.length < SESSION_ID_LENGTH) {
      // Fail dark, never fail into a weaker id.
      entropyFailed = true;
      state = null;
      pendingRotation = 'entropy_unavailable';
      return null;
    }
    entropyFailed = false;
    const nowTs = deps.now();
    const id = letterFirst(encodeRandom(bytes, SESSION_ID_LENGTH, ALPHABET));
    const final: SessionState = {
      id,
      epoch: (state?.epoch ?? 0) + 1,
      refSalt: letterFirst(encodeRandom(saltBytes, REF_SALT_LENGTH, ALPHABET)),
      startedAt: nowTs,
      lastSeenAt: nowTs,
      consentVersion,
    };
    state = final;
    pendingRotation = reason;
    persist(final);
    return final;
  }

  /** First character forced to a letter so a ref can never parse as a number downstream. */
  function letterFirst(value: string): string {
    const first = value.charAt(0);
    if (/[a-z]/.test(first)) return value;
    return `${charAt(LETTERS, first.charCodeAt(0) + 3)}${value.slice(1)}`;
  }

  function persist(s: SessionState): void {
    const stored: StoredSession = {
      v: 1,
      id: s.id,
      epoch: s.epoch,
      refSalt: s.refSalt,
      startedAt: s.startedAt,
      lastSeenAt: s.lastSeenAt,
      consentVersion: s.consentVersion,
    };
    try {
      deps.storage.write(SESSION_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      /* in-memory only for this page load; nothing is sent that depends on it surviving */
    }
  }

  function load(): StoredSession | null {
    try {
      return parseStored(deps.storage.read(SESSION_STORAGE_KEY));
    } catch {
      return null;
    }
  }

  function adopt(stored: StoredSession): SessionState {
    state = {
      id: stored.id,
      epoch: stored.epoch,
      refSalt: stored.refSalt,
      startedAt: stored.startedAt,
      lastSeenAt: stored.lastSeenAt,
      consentVersion: stored.consentVersion,
    };
    return state;
  }

  function ensure(reasonIfNew: RotationReason = 'first_visit'): SessionState | null {
    if (state === null) {
      const stored = load();
      if (stored === null) return mint(reasonIfNew, 0);
      state = adopt(stored);
    }
    const nowTs = deps.now();
    if (nowTs - state.lastSeenAt > idleMs) return mint('idle_expired', state.consentVersion);
    if (nowTs - state.startedAt > maxMs) return mint('max_age', state.consentVersion);
    if (nowTs - state.lastSeenAt > TOUCH_PERSIST_MS) {
      state = { ...state, lastSeenAt: nowTs };
      persist(state);
    }
    return state;
  }

  return {
    current() {
      const s = ensure();
      return { state: s, available: s !== null && !entropyFailed };
    },

    bindConsent(consentVersion, reason) {
      const s = ensure();
      if (s === null) return { state: null, available: false };
      if (s.consentVersion === consentVersion) return { state: s, available: !entropyFailed };
      // Consent state changed: the old id is retired rather than relabelled. Reusing it would mean
      // the rows written under the previous permission are still joinable to the rows after it.
      const next = mint(reason, consentVersion);
      return { state: next, available: next !== null };
    },

    rotate(reason) {
      const consentVersion = state?.consentVersion ?? 0;
      const next = mint(reason, consentVersion);
      return { state: next, available: next !== null };
    },

    drainRotation() {
      const r = pendingRotation;
      pendingRotation = null;
      return r;
    },

    refFor(kind, entityId) {
      const s = ensure();
      if (s === null) return null;
      // An empty or absurd input is a bug at the call site; emitting a ref for it would create a ref
      // that every broken call site shares, which is the opposite of a correlation key.
      if (typeof entityId !== 'string' || entityId.length === 0 || entityId.length > 200) return null;
      return keyedDigest(s.refSalt, `${kind}:${entityId}`, REF_LENGTH);
    },

    ageMs() {
      const s = ensure();
      return s === null ? 0 : Math.max(0, deps.now() - s.startedAt);
    },

    reset() {
      state = null;
      pendingRotation = null;
      entropyFailed = false;
      try {
        deps.storage.remove(SESSION_STORAGE_KEY);
      } catch {
        /* nothing */
      }
    },
  };
}

/** The one CSPRNG the app is allowed to use; exported so the wiring in `index.ts` has a named source. */
export function browserRandom(count: number): Uint8Array | null {
  const cryptoObj = (globalThis as { crypto?: Crypto & { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    try {
      const out = new Uint8Array(count);
      cryptoObj.getRandomValues(out);
      return out;
    } catch {
      return null;
    }
  }
  // `crypto.getRandomValues` absent is a non-secure context or an ancient WebView. Both get the same
  // answer as no entropy at all: analytics stays off. `Math.random()` is never a substitute.
  return null;
}

/** Bucket helper kept here so the age bucket and the rotation thresholds cannot drift apart. */
export function sessionAgeBucket(ageMs: number): 'under_15m' | '15_60m' | '1_8h' | 'over_8h' {
  if (ageMs < 15 * 60 * 1000) return 'under_15m';
  if (ageMs < 60 * 60 * 1000) return '15_60m';
  if (ageMs < 8 * 60 * 60 * 1000) return '1_8h';
  return 'over_8h';
}
