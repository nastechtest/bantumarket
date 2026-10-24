/**
 * Connectivity is read, never assumed. A screen that renders stale rows while claiming to be live
 * is worse than an offline banner, so every cursor fetch checks this before it starts.
 */
let online = typeof navigator === 'undefined' ? true : navigator.onLine;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getOnline(): boolean {
  return online;
}

export function setOnline(next: boolean): void {
  if (online === next) return;
  online = next;
  emit();
}

export function subscribeOnline(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function installConnectivityListeners(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> | null = typeof window === 'undefined' ? null : window,
): () => void {
  if (target === null) return () => undefined;
  const onOnline = () => setOnline(true);
  const onOffline = () => setOnline(false);
  target.addEventListener('online', onOnline);
  target.addEventListener('offline', onOffline);
  return () => {
    target.removeEventListener('online', onOnline);
    target.removeEventListener('offline', onOffline);
  };
}

/** Test seam: jsdom's navigator.onLine is not something a test can meaningfully flip. */
export function resetOnlineForTests(): void {
  online = true;
  emit();
}
