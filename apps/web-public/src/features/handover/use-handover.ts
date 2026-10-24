import { useCallback, useEffect, useRef, useState } from 'react';
import type { HandoverSlot, HandoverTokenView, HandoverTransport, HandoverVenue, NoShowReport, PresentPinResult } from './api/handover-transport.js';
import { describeWindow, parseServerInstant } from '../../lib/window-validity.js';
import type { WindowView } from '../../lib/window-validity.js';

/**
 * Handover page state, driven entirely by the transport and the SERVER clock it returns
 * (`serverNowIso`). The device clock is used for nothing money- or window-bearing; the only
 * client-side timer is a 15 s tick that re-renders a countdown, and even that recomputes from
 * the last server instant plus the elapsed device delta, never from `new Date()` alone.
 */

export type HandoverLoad =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'unscheduled' }
  | { readonly kind: 'ready'; readonly token: HandoverTokenView };

export interface PresentState {
  readonly busy: boolean;
  readonly last: PresentPinResult | null;
}

export function useHandover(transport: HandoverTransport, orderId: string) {
  const [load, setLoad] = useState<HandoverLoad>({ kind: 'loading' });
  const [present, setPresent] = useState<PresentState>({ busy: false, last: null });
  // The plaintext PIN exists in the schedule response only (`ScheduledHandover` is returned once);
  // the hook holds it just long enough for the reveal screen, clears it on acknowledge, and never
  // puts it in a URL, a log, or a query param.
  const [pinToReveal, setPinToReveal] = useState<string | null>(null);
  const [noShow, setNoShow] = useState<NoShowReport | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);

  const reload = useCallback(() => {
    const gen = ++generation.current;
    setLoad({ kind: 'loading' });
    setPinToReveal(null);
    transport
      .getActiveHandover(orderId)
      .then((token) => {
        if (generation.current !== gen) return;
        setLoad(token === null ? { kind: 'unscheduled' } : { kind: 'ready', token });
      })
      .catch((e: unknown) => {
        if (generation.current === gen) setLoad({ kind: 'failed', message: messageOf(e) });
      });
  }, [transport, orderId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const schedule = useCallback(
    async (venueId: string, slotId: string) => {
      const result = await transport.scheduleHandover(orderId, { venueId, slotId });
      setPinToReveal(result.pin);
      setLoad({ kind: 'ready', token: result.token });
      return result;
    },
    [transport, orderId],
  );

  const reissue = useCallback(async () => {
    const result = await transport.reissueHandover(orderId);
    setPinToReveal(result.pin);
    setLoad({ kind: 'ready', token: result.token });
    setPresent({ busy: false, last: null });
    return result;
  }, [transport, orderId]);

  const presentPin = useCallback(
    async (pin: string) => {
      // A ref, not state: two taps inside one React batch both read the pre-update `busy`,
      // but they cannot both win a ref race. One presentation reaches the transport, period.
      if (inFlight.current) return null;
      inFlight.current = true;
      setPresent((p) => ({ ...p, busy: true }));
      try {
        const result = await transport.presentPin(orderId, pin);
        setPresent({ busy: false, last: result });
        // Re-read the token so the window bar and the two-sided state come back server-derived.
        const fresh = await transport.getActiveHandover(orderId);
        if (fresh !== null) setLoad({ kind: 'ready', token: fresh });
        return result;
      } catch (e: unknown) {
        setPresent({ busy: false, last: null });
        throw e instanceof Error ? e : new Error(String(e));
      } finally {
        inFlight.current = false;
      }
    },
    [transport, orderId],
  );

  const reportNoShow = useCallback(async () => {
    const report = await transport.reportNoShow(orderId);
    setNoShow(report);
    return report;
  }, [transport, orderId]);

  /** The window bar's input: server "now" from the token, never the device's. */
  const windowView: WindowView | null =
    load.kind === 'ready' ? describeWindow(parseServerNowMs(load.token), load.token.opensAtIso, load.token.expiresAtIso) : null;

  return {
    load,
    reload,
    schedule,
    reissue,
    present,
    presentPin,
    noShow,
    reportNoShow,
    windowView,
    /** The PIN, available exactly once after schedule/reissue; null once acknowledged. */
    pinOnce: pinToReveal,
    acknowledgePinShown: () => setPinToReveal(null),
  };
}

function parseServerNowMs(token: HandoverTokenView): number {
  return parseServerInstant(token.serverNowIso);
}

/**
 * Countdown support: derive an evaluation age so a live ticking UI can advance the server's
 * instant by elapsed device time without pretending the device knows the time.
 */
export function serverNowMs(token: HandoverTokenView): number {
  return parseServerNowMs(token);
}

export function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'Could not reach the handover service. Nothing you did has been lost — try again.';
}

export type { HandoverSlot, HandoverVenue };
