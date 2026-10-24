import { useSyncExternalStore } from 'react';
import type { StaffSession } from './session.js';
import { getStaffSession, subscribeStaffSession } from './session-store.js';

export function useStaffSession(): StaffSession | null {
  return useSyncExternalStore(subscribeStaffSession, getStaffSession, () => null);
}
