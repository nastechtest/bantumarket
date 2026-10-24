import type { Capability } from '../permissions.js';
import type { StaffSession } from '../session.js';

/** The identity surface. `whoAmI` is the only source of capabilities in this app. */
export interface ShellTransport {
  whoAmI(): Promise<StaffSession>;
  capabilities(): Promise<readonly Capability[]>;
}

export class ShellRefusal extends Error {
  readonly code: 'unauthenticated' | 'unavailable' | 'payload';

  constructor(code: 'unauthenticated' | 'unavailable' | 'payload', message: string) {
    super(message);
    this.name = 'ShellRefusal';
    this.code = code;
  }
}
