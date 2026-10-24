import { createContext, createElement, useContext, type ReactNode } from 'react';
import { motionCss } from '@nastech/motion';
import {
  browserOnlineSource,
  createOnlineStore,
  type OnlineSource,
  type OnlineStore,
} from './lib/online.js';
import {
  createSellerSessionStore,
  type SellerSessionStore,
} from './lib/session.js';
import { supportContact, type SupportContact } from './lib/support.js';

/**
 * Composition root helpers, not a second main.tsx (that file is controller-owned). It reads the
 * public environment through one guarded door, builds the two stores the shell needs, installs
 * the generated motion variables, and exposes a provider so features read the same instances.
 * It never resolves a session and never fetches: both are feature/transport concerns.
 */

export type PublicEnv = Record<string, string | boolean | undefined>;

type MetaWithEnv = ImportMeta & { readonly env?: PublicEnv };

export function readPublicEnv(meta: ImportMeta = import.meta): PublicEnv {
  const env = (meta as MetaWithEnv).env;
  if (env !== undefined && env !== null && typeof env === 'object') return env;
  return {};
}

/** Only a non-empty string counts as configured; `VITE_X=""` means "not set" in every ops sense. */
export function envString(env: PublicEnv, key: string): string | null {
  const value = env[key];
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return null;
}

export const publicEnv: PublicEnv = readPublicEnv();

export const MOTION_STYLE_ID = 'nt-motion-vars';

/**
 * The generated @nastech/motion variables, inserted once. `motionCss()` owns the values and the
 * reduced-motion block; no duration or easing is re-typed here. Returns a remover for tests and
 * HMR; a second call is a no-op so two boots cannot stack stylesheets.
 */
export function installMotionCss(
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
): () => void {
  if (doc === undefined) return () => {};
  if (doc.getElementById(MOTION_STYLE_ID) !== null) return () => {};

  const style = doc.createElement('style');
  style.id = MOTION_STYLE_ID;
  style.setAttribute('data-nastech-motion', '');
  style.textContent = motionCss();
  doc.head.appendChild(style);

  return () => {
    style.remove();
  };
}

export interface SellerRuntime {
  readonly session: SellerSessionStore;
  readonly onlineStore: OnlineStore;
  readonly support: SupportContact | null;
  dispose(): void;
}

export interface SellerRuntimeOptions {
  readonly session: SellerSessionStore;
  readonly env?: PublicEnv;
  readonly onlineSource?: OnlineSource;
}

export function createSellerRuntime(options: SellerRuntimeOptions): SellerRuntime {
  const onlineStore = createOnlineStore(options.onlineSource ?? browserOnlineSource());
  const support = supportContact(options.env ?? publicEnv);
  let disposed = false;

  return {
    session: options.session,
    onlineStore,
    support,
    dispose() {
      if (disposed) return;
      disposed = true;
      onlineStore.dispose();
    },
  };
}

export interface BootSellerOptions extends SellerRuntimeOptions {
  readonly document?: Document;
}

/** Boot-time side effects with a matching cleanup, so a test or HMR mount leaves no style behind. */
export function bootSeller(options: BootSellerOptions): SellerRuntime {
  const runtime = createSellerRuntime(options);
  const removeMotionCss = installMotionCss(options.document);
  let disposed = false;

  return {
    session: runtime.session,
    onlineStore: runtime.onlineStore,
    support: runtime.support,
    dispose() {
      if (disposed) return;
      disposed = true;
      removeMotionCss();
      runtime.dispose();
    },
  };
}

const SellerRuntimeContext = createContext<SellerRuntime | null>(null);

export function SellerProviders({
  runtime,
  children,
}: {
  readonly runtime: SellerRuntime;
  readonly children: ReactNode;
}) {
  return createElement(SellerRuntimeContext.Provider, { value: runtime }, children);
}

export function useSellerRuntime(): SellerRuntime {
  const runtime = useContext(SellerRuntimeContext);
  if (runtime === null) {
    throw new Error('useSellerRuntime must be used inside <SellerProviders>.');
  }
  return runtime;
}

export { DEFAULT_SUPPORT_EMAIL, formatZaPhone, parseZaPhone, supportContact, supportHref } from './lib/support.js';
export type { SupportContact } from './lib/support.js';
export { createSellerSessionStore } from './lib/session.js';
export type { SellerProfile, SellerSessionState, SellerSessionStore } from './lib/session.js';
