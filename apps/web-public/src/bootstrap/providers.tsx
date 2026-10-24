import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { appBootTimer, markBoot, observeLargestContentfulPaint, type BootTimer } from './boot-timing.js';
import { defaultFlags, resolveFlags, type FlagName, type Flags } from './feature-flags.js';
import { envString, readPublicEnv, type PublicEnv } from './env.js';
import { appOnlineStore, type OnlineStore } from '../lib/online-status.js';

/**
 * Provider tree, mounted once by `main.tsx` (controller-owned; see report for the wiring diff).
 * Deliberately tiny: every context a shell needs is *stable* (store/flag objects created once),
 * and every mount-time effect here is idempotent. Nothing in this file may load data — that is
 * what makes it safe to put above the router on money-path routes.
 */

interface ShellContextValue {
  readonly flags: Flags;
  readonly onlineStore: OnlineStore;
  readonly bootTimer: BootTimer;
  readonly env: PublicEnv;
}

const ShellContext = createContext<ShellContextValue>({
  flags: defaultFlags,
  onlineStore: appOnlineStore,
  bootTimer: appBootTimer,
  env: {},
});

export function AppProviders({ children }: { readonly children: ReactNode }) {
  const value: ShellContextValue = {
    flags: resolveFlags(envString(publicEnvCached, 'VITE_FLAGS_JSON')),
    onlineStore: appOnlineStore,
    bootTimer: appBootTimer,
    env: publicEnvCached,
  };
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

// Read once at module scope: `resolveFlags` and `envString` are pure; re-reading per render
// would let a flag flip mid-session silently, and flags are a boot decision (see feature-flags).
const publicEnvCached: PublicEnv = readPublicEnv();

/**
 * Chrome-side boot effects: mark interactivity, start the LCP observer, and log a boot budget
 * line in devtools. Returns nothing — effects that report go through `reportError`, so the
 * console line is the last honest fallback until a sink is attached.
 */
export function useChromeBootEffects(): void {
  const { bootTimer, onlineStore } = useContext(ShellContext);
  useEffect(() => {
    markBoot('chrome:interactive');
    const stopLcp = observeLargestContentfulPaint((valueMs) => {
      bootTimer.mark('route:ready');
      const renderToLcp = bootTimer.elapsed('react:first-render', 'chrome:interactive');
      if (typeof console !== 'undefined' && console.info) {
        console.info(`[nt:boot] LCP ${valueMs.toFixed(0)}ms, chrome interactive delta ${renderToLcp ?? 'n/a'}`);
      }
    });
    // One subscription for the app; the banner and the buy bar read the store, never window.
    const stopOnline = onlineStore.subscribe(() => {
      // A status flip is worth a devtools line; the UI reaction is the store's listeners'.
      if (typeof console !== 'undefined' && console.info) {
        console.info(`[nt:boot] online status ${onlineStore.get() ? 'back' : 'lost'}`);
      }
    });
    return () => {
      stopLcp();
      stopOnline();
    };
  }, [bootTimer, onlineStore]);
}

export function useFlags(): Flags {
  return useContext(ShellContext).flags;
}

export function useFlag(name: FlagName): boolean {
  return useFlags()[name];
}

export function useOnlineStore(): OnlineStore {
  return useContext(ShellContext).onlineStore;
}
