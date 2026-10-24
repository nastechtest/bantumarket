import type { StaffSession } from './session.js';

/**
 * The console keeps one session. In production this is populated by the auth transport after MFA
 * and cleared by the timeout watcher; the store exists so every route can read the same answer
 * without threading a context through the controller-owned router.
 *
 * CONTRACT-GAP: brief 57 owns `src/bootstrap/session.tsx`; when it lands this store becomes the
 * value it provides and the subscription moves there. The behaviour below is the contract.
 */
let current: StaffSession | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getStaffSession(): StaffSession | null {
  return current;
}

export function setStaffSession(session: StaffSession | null): void {
  current = session;
  emit();
}

export function clearStaffSession(): void {
  setStaffSession(null);
}

export function subscribeStaffSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam only: every test file starts from "signed out" unless it says otherwise. */
export function resetStaffSessionForTests(): void {
  setStaffSession(null);
}
