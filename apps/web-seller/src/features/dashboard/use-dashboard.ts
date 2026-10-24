import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { DashboardSnapshot, DashboardTransport } from './api/dashboard-transport.js';

/**
 * Load lifecycle for the one-shot dashboard read. It distinguishes "never loaded" (loading),
 * "loaded and stale" (ready + offline) and "failed" (error), because the shell's offline chrome
 * needs to know whether there is anything to show underneath it.
 */

export type DashboardState =
  | { readonly status: 'loading'; readonly snapshot: null; readonly error: null }
  | { readonly status: 'error'; readonly snapshot: null; readonly error: string; readonly retryable: boolean }
  | { readonly status: 'ready'; readonly snapshot: DashboardSnapshot; readonly error: null };

type Action =
  | { type: 'load' }
  | { type: 'ok'; snapshot: DashboardSnapshot }
  | { type: 'fail'; message: string; retryable: boolean };

function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case 'load':
      // Keep a previous snapshot on refresh? No: the overview must never show a number the last
      // response did not contain. During a reload the card list is replaced by the loading state.
      return { status: 'loading', snapshot: null, error: null };
    case 'ok':
      return { status: 'ready', snapshot: action.snapshot, error: null };
    case 'fail':
      return { status: 'error', snapshot: null, error: action.message, retryable: action.retryable };
  }
}

export interface UseDashboard {
  readonly state: DashboardState;
  readonly reload: () => void;
}

export function useDashboard(transport: DashboardTransport): UseDashboard {
  const [state, dispatch] = useReducer(reducer, { status: 'loading', snapshot: null, error: null });
  const [attempt, bump] = useReducer((n: number) => n + 1, 0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    dispatch({ type: 'load' });
    transport.load(controller.signal).then(
      (snapshot) => {
        if (mounted.current && !controller.signal.aborted) dispatch({ type: 'ok', snapshot });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error && error.message ? error.message : 'The request did not complete.';
        dispatch({ type: 'fail', message, retryable: true });
      },
    );
    return () => controller.abort();
  }, [transport, attempt]);

  const reload = useCallback(() => bump(), []);
  return { state, reload };
}

/** SAST is UTC+2 all year — South Africa has no DST. Must stay equal to i18n's `SAST_OFFSET_MINUTES`. */
const SAST_OFFSET_MINUTES = 120;

/**
 * SAST hours, not host hours. Every other clock on this screen is SAST ("By 17 Oct, 18:00",
 * "Next payout run: 2026-10-19"), so `getHours()` would greet a seller travelling in Berlin by
 * Berlin time while the deadlines stayed Cape Town. The +2h shift is inlined, not imported:
 * `@nastech/i18n` owns `SAST_OFFSET_MINUTES` but is on this app's forbidden-import list.
 */
export function greeting(now: Date): string {
  const hour = new Date(now.getTime() + SAST_OFFSET_MINUTES * 60_000).getUTCHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
