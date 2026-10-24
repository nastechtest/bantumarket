import { useEffect, useState } from 'react';

/**
 * A coarse clock for countdowns. Session and impersonation banners must not go stale on an operator
 * who has not navigated in ten minutes, but per-second rendering would re-render the whole console
 * for a value that is displayed in minutes. Thirty seconds is enough for a truthful countdown and
 * cheap enough to leave running on a desk screen.
 */
export function useNow(intervalMs = 30_000): string {
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  useEffect(() => {
    if (intervalMs <= 0) return;
    const id = window.setInterval(() => setNowIso(new Date().toISOString()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return nowIso;
}
