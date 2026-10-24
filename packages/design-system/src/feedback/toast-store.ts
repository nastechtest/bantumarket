/**
 * The toast queue, headless. A store rather than context because the people who raise a toast —
 * an api-client error handler on a seller screen — are often nowhere near the React tree that
 * renders the viewport, and because a queue cap is a real product decision ("what just failed"
 * beats "everything that ever failed") that belongs in one testable place.
 *
 * Rules encoded here:
 *  - At most `MAX_VISIBLE` toasts; a push past the cap evicts the oldest so a bursting error
 *    never buries the newest fact.
 *  - `negative` toasts are assertive by default (a failure must interrupt the reading);
 *    everything else is polite.
 *  - The snapshot is referentially stable between mutations — `useSyncExternalStore` spins
 *    forever on a fresh array per read, so getSnapshot returns the same reference until push or
 *    dismiss replaces it.
 */

export type ToastTone = 'info' | 'positive' | 'caution' | 'negative';

export interface Toast {
  readonly id: string;
  readonly tone: ToastTone;
  readonly title: string;
  readonly body?: string;
  readonly assertive: boolean;
  readonly ttlMs?: number;
}

export type ToastInput = Omit<Toast, 'id' | 'assertive'> & { id?: string; assertive?: boolean };

export interface ToastStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly Toast[];
  push(input: ToastInput): Toast;
  dismiss(id: string): boolean;
  clear(): void;
}

export const MAX_VISIBLE = 4;

export function createToastStore(): ToastStore {
  let toasts: readonly Toast[] = [];
  const listeners = new Set<() => void>();
  let seq = 0;

  const emit = () => {
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return toasts;
    },
    push(input) {
      seq += 1;
      const toast: Toast = {
        id: input.id ?? `ds-toast-${seq}`,
        tone: input.tone,
        title: input.title,
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.ttlMs !== undefined ? { ttlMs: input.ttlMs } : {}),
        assertive: input.assertive ?? input.tone === 'negative',
      };
      const next = [...toasts, toast];
      toasts = next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
      emit();
      return toast;
    },
    dismiss(id) {
      const next = toasts.filter((t) => t.id !== id);
      if (next.length === toasts.length) return false;
      toasts = next;
      emit();
      return true;
    },
    clear() {
      if (toasts.length === 0) return;
      toasts = [];
      emit();
    },
  };
}

/** The app-level queue; per-store instances exist for tests and isolated staff panes. */
export const toastStore = createToastStore();
