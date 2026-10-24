import type { Capability } from './permissions.js';
import { capabilityDescription, capabilityForPath, decidePath, roleToAsk } from './permissions.js';
import type { StaffSession } from './session.js';
import { sessionRefusal } from './session.js';

export interface WhoAmITransport {
  whoAmI(): Promise<StaffSession>;
  capabilities(): Promise<readonly Capability[]>;
}

export class ShellTransportError extends Error {
  readonly code: 'unauthorised' | 'unavailable' | 'malformed';

  constructor(code: 'unauthorised' | 'unavailable' | 'malformed', message: string) {
    super(message);
    this.name = 'ShellTransportError';
    this.code = code;
  }
}

export interface CapabilityRow {
  readonly capability: Capability;
  readonly description: string;
  readonly granted: boolean;
}

/**
 * The capability list on screen comes from the transport. `decidePath` reads the same list, but
 * this function is what makes the route table irrelevant to identity: an operator can see exactly
 * what the server granted, including the things no route currently uses.
 */
export function capabilityRows(session: StaffSession): readonly CapabilityRow[] {
  return session.capabilities.map((capability) => ({
    capability,
    description: capabilityDescription(capability),
    granted: true,
  }));
}

interface Refusal {
  readonly reason: string;
  readonly capability: Capability | null;
}

export function whoAmIRefusal(
  session: StaffSession | null,
  pathname: string,
  nowIso: string,
): Refusal | null {
  if (session === null) return { reason: 'Sign in to use the console.', capability: capabilityForPath(pathname) };
  const refusal = sessionRefusal(session, capabilityForPath(pathname) ?? 'queue.view', nowIso);
  if (refusal && refusal.code !== 'capability_missing') return { reason: refusal.message, capability: capabilityForPath(pathname) };
  const decision = decidePath(session, pathname);
  if (!decision.allowed) return { reason: decision.reason ?? 'Your role does not include this.', capability: decision.capability };
  return null;
}

export function askRoleFor(capability: Capability | null): string {
  return capability === null ? 'Console administrator' : roleToAsk(capability);
}
