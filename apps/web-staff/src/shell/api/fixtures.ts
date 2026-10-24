import type { Capability } from '../permissions.js';
import { roleBaseline } from '../permissions.js';
import type { StaffRole } from '../role.js';
import type { ImpersonationSession, StaffSession } from '../session.js';
import type { ShellTransport } from './shell-transport.js';
import { ShellRefusal } from './shell-transport.js';

/** Fixed server clock for fixtures, so timestamps in tests never drift. */
export const FIXTURE_NOW = '2026-10-22T09:00:00.000Z';

export interface FixtureSessionInput {
  readonly operatorId?: string;
  readonly displayName?: string;
  readonly role?: StaffRole;
  readonly capabilities?: readonly Capability[];
  readonly mfaSatisfied?: boolean;
  readonly expiresAt?: string;
  readonly impersonation?: ImpersonationSession | null;
  readonly recognisedDevice?: boolean;
}

export function fixtureSession(input: FixtureSessionInput = {}): StaffSession {
  const role = input.role ?? 'reviewer';
  return {
    operatorId: input.operatorId ?? 'staff_thandi',
    displayName: input.displayName ?? 'Thandi Mokoena',
    role,
    capabilities: input.capabilities ?? roleBaseline(role),
    mfaSatisfied: input.mfaSatisfied ?? true,
    issuedAt: FIXTURE_NOW,
    expiresAt: input.expiresAt ?? '2026-10-22T10:00:00.000Z',
    device: {
      deviceId: 'dev_console_01',
      firstSeenAt: '2026-09-01T07:30:00.000Z',
      recognised: input.recognisedDevice ?? true,
    },
    impersonation: input.impersonation ?? null,
  };
}

export function createShellTransport(session: StaffSession = fixtureSession()): ShellTransport {
  let current = session;
  return {
    async whoAmI() {
      return current;
    },
    async capabilities() {
      return current.capabilities;
    },
  };
}

export function createFailingShellTransport(): ShellTransport {
  return {
    async whoAmI() {
      throw new ShellRefusal('unavailable', 'Identity service did not answer.');
    },
    async capabilities() {
      throw new ShellRefusal('unavailable', 'Capability list did not load.');
    },
  };
}
