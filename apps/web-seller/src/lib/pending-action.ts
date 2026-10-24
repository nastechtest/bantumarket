import { internalPath, SIGN_IN_PATH } from './navigate.js';
import {
  browserKeyValues,
  readJson,
  writeJson,
  type KeyValueStore,
} from './storage.js';

/**
 * A blocked critical screen is remembered so sign-in can hand the seller back to it. It is a
 * *destination*, not a queued action: nothing financial is replayed, re-submitted or retried —
 * the return-to screen is re-rendered and the seller acts again with a live session.
 */

export const PENDING_ACTION_KEY = 'nastech.seller.pending-action.v1';
export const PENDING_ACTION_TTL_MS = 30 * 60 * 1000;

export interface PendingAction {
  readonly path: string;
  readonly savedAt: number;
  readonly reason: 'session-required';
}

function isSignInDestination(path: string): boolean {
  return (
    path === SIGN_IN_PATH ||
    path.startsWith(`${SIGN_IN_PATH}?`) ||
    path.startsWith(`${SIGN_IN_PATH}#`)
  );
}

export function pendingActionFor(path: string, now: number): PendingAction | null {
  const safe = internalPath(path, '/');
  if (safe === '/' || isSignInDestination(safe)) return null;
  return { path: safe, savedAt: now, reason: 'session-required' };
}

function parsePendingAction(value: unknown, now: number): PendingAction | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.reason !== 'session-required') return null;
  if (typeof record.path !== 'string') return null;
  if (typeof record.savedAt !== 'number' || !Number.isFinite(record.savedAt)) return null;

  const age = now - record.savedAt;
  if (age < 0 || age > PENDING_ACTION_TTL_MS) return null;

  const safe = internalPath(record.path, '/');
  if (safe !== record.path || safe === '/' || isSignInDestination(safe)) return null;
  return { path: safe, savedAt: record.savedAt, reason: 'session-required' };
}

function defaultStore(): KeyValueStore {
  return browserKeyValues('session');
}

export function savePendingAction(action: PendingAction, store: KeyValueStore = defaultStore()): boolean {
  return writeJson(store, PENDING_ACTION_KEY, action);
}

export function readPendingAction(
  store: KeyValueStore = defaultStore(),
  now: number = Date.now(),
): PendingAction | null {
  return readJson(store, PENDING_ACTION_KEY, (value) => parsePendingAction(value, now));
}

export function consumePendingAction(
  store: KeyValueStore = defaultStore(),
  now: number = Date.now(),
): PendingAction | null {
  const action = readPendingAction(store, now);
  if (action !== null) store.remove(PENDING_ACTION_KEY);
  return action;
}

export function clearPendingAction(store: KeyValueStore = defaultStore()): void {
  store.remove(PENDING_ACTION_KEY);
}
