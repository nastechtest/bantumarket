import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { StaffSession } from './shell/session.js';
import { setStaffSession } from './shell/session-store.js';
import { installConnectivityListeners } from './shell/connectivity.js';
import { ConsoleRoot } from './layout/console-root.js';
import { installNoindex } from './lib/noindex.js';

export interface ConsoleHandle {
  unmount(): void;
}

export interface MountConsoleOptions {
  readonly root?: HTMLElement;
  readonly document?: Document;
  /** Seed for the session store; auth owns the sign-in flow that replaces it later. */
  readonly session?: StaffSession | null;
}

/**
 * Document-level invariants that must hold before the first component mounts. Split from
 * `mountConsole` so a test can prove them without constructing a React root.
 */
export function bootConsoleDocument(doc: Document): void {
  doc.documentElement.setAttribute('data-surface', 'staff');
  installNoindex(doc);
}

/**
 * Entry point for `main.tsx` (controller-owned). It mounts the frame around the router's page tree
 * and seeds the single session store; it does not fetch identity — that is the auth transport's job.
 */
export function mountConsole(options: MountConsoleOptions = {}): ConsoleHandle {
  const doc = options.document ?? (typeof document === 'undefined' ? null : document);
  if (doc === null) throw new Error('web-staff: mountConsole needs a document');
  bootConsoleDocument(doc);
  if (options.session !== undefined) setStaffSession(options.session);

  const host = options.root ?? doc.getElementById('root');
  if (host === null) throw new Error('web-staff: index.html has no #root element');

  const stopConnectivity = installConnectivityListeners(doc.defaultView);
  const root = createRoot(host);
  root.render(createElement(ConsoleRoot));

  return {
    unmount() {
      stopConnectivity();
      root.unmount();
    },
  };
}
