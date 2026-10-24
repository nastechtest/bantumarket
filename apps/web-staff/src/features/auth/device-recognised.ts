import type { DeviceRecognition } from '../../shell/session.js';
import { daysBetween } from '../../shell/time.js';

/**
 * Device recognition is a fact about history: "this browser has signed in before" or "this is a
 * new browser". It is never an assurance badge, and it never substitutes for the second factor.
 */
export type DevicePosture = 'recognised' | 'new' | 'unknown';

export function devicePosture(device: DeviceRecognition | null): DevicePosture {
  if (device === null) return 'unknown';
  return device.recognised ? 'recognised' : 'new';
}

export function deviceNotice(posture: DevicePosture, nowIso: string, device: DeviceRecognition | null): string {
  switch (posture) {
    case 'recognised': {
      if (device === null) return 'This browser has signed in before.';
      const days = daysBetween(device.firstSeenAt, nowIso);
      return `This browser has signed in before (first seen ${days} day${days === 1 ? '' : 's'} ago).`;
    }
    case 'new':
      return 'This browser has not signed in to the console before. The second factor is still required.';
    default:
      return 'This browser cannot be looked up. The second factor is still required.';
  }
}

/** A new device does not skip or weaken MFA; it adds a notice the operator must acknowledge. */
export function requiresAcknowledgement(posture: DevicePosture): boolean {
  return posture === 'new';
}
