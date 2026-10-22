import { preloadableUrls, type FrameStrip } from './frame-strip.js';

/**
 * Frame preloading (07 §4.4). A turntable that shows an empty cell mid-scrub is worse than no
 * turntable, because it reads as damage to the item. So the strip is warmed before it is visible —
 * and never warmed at all when the buyer has asked us to save their data.
 *
 * Save-data is a refusal, not a hint: 12 photographs nobody scrubbed to is a bill the buyer opted out
 * of. The sprite still works frame by frame, fetching each cell on demand.
 */

export type ImageLoader = (url: string, signal: AbortSignal) => Promise<void>;

export type PreloadSkipReason = 'ok' | 'no-frames' | 'save-data' | 'already-aborted';

export interface PreloadResult {
  readonly loaded: number;
  readonly failed: number;
  readonly cancelled: boolean;
  /** Bytes the buyer did not get because the load stopped early. A skipped url is not a failure. */
  readonly notAttempted: number;
}

export interface PreloadHandle {
  readonly urls: readonly string[];
  readonly skipped: boolean;
  readonly reason: PreloadSkipReason;
  readonly done: Promise<PreloadResult>;
  cancel(reason?: string): void;
}

export interface PreloadOptions {
  readonly saveData?: boolean;
  readonly signal?: AbortSignal;
  /** Injectable so tests can count transports; production uses the browser cache. */
  readonly loadImage?: ImageLoader;
  /** Frames in flight at once. Three keeps a 2G link from queueing the poster behind the strip. */
  readonly concurrency?: number;
}

/**
 * Warms the HTTP cache via an Image element. Abandoning means detaching the handlers and clearing
 * `src` — a real abort is the one thing `Image` does not offer, and leaving the handlers attached
 * resolves a load the buyer already walked away from.
 */
export const imageElementLoader: ImageLoader = (url, signal) =>
  new Promise<void>((resolve, reject) => {
    if (typeof Image !== 'function') {
      resolve();
      return;
    }
    const img = new Image();
    const finish = (fn: () => void) => {
      img.onload = null;
      img.onerror = null;
      signal.removeEventListener('abort', onAbort);
      fn();
    };
    const onAbort = () => {
      img.src = '';
      finish(() => reject(new DOMException('Preload aborted', 'AbortError')));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    img.onload = () => finish(() => resolve());
    img.onerror = () => finish(() => reject(new Error(`Frame ${url} failed to preload`)));
    signal.addEventListener('abort', onAbort, { once: true });
    img.decoding = 'async';
    img.src = url;
  });

export function preloadFrameStrip(strip: FrameStrip | null, options: PreloadOptions = {}): PreloadHandle {
  const { saveData = false, signal, loadImage = imageElementLoader, concurrency = 3 } = options;
  const urls = preloadableUrls(strip);

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort(new DOMException('Preload aborted', 'AbortError'));
  if (signal && !signal.aborted) signal.addEventListener('abort', onExternalAbort, { once: true });
  if (signal?.aborted) controller.abort(new DOMException('Preload aborted', 'AbortError'));

  let skipped = false;
  let reason: PreloadSkipReason = 'ok';
  if (urls.length === 0) {
    skipped = true;
    reason = 'no-frames';
  } else if (saveData) {
    skipped = true;
    reason = 'save-data';
  } else if (controller.signal.aborted) {
    skipped = true;
    reason = 'already-aborted';
  }

  if (skipped) {
    // Nothing was requested, so nothing is in flight to leak.
    return { urls: [], skipped, reason, done: Promise.resolve({ loaded: 0, failed: 0, cancelled: false, notAttempted: 0 }), cancel() {} };
  }

  const queue = [...urls];
  const inflight = new Set<Promise<void>>();
  let loaded = 0;
  let failed = 0;
  let finished = false;

  let resolveDone!: (result: PreloadResult) => void;
  const done = new Promise<PreloadResult>((resolve) => {
    resolveDone = resolve;
  });

  const finish = () => {
    if (finished) return;
    finished = true;
    signal?.removeEventListener('abort', onExternalAbort);
    resolveDone({ loaded, failed, cancelled: controller.signal.aborted, notAttempted: queue.length });
  };
  controller.signal.addEventListener('abort', finish, { once: true });

  const pump = (): void => {
    while (!controller.signal.aborted && !finished && inflight.size < Math.max(1, concurrency) && queue.length > 0) {
      const url = queue.shift()!;
      const task = loadImage(url, controller.signal)
        .then(() => {
          loaded += 1;
        })
        .catch(() => {
          // An aborted frame is not a failed frame; the count has to keep them apart.
          if (!controller.signal.aborted) failed += 1;
        })
        .finally(() => {
          inflight.delete(task);
          pump();
        });
      inflight.add(task);
    }
    if (inflight.size === 0) finish();
  };
  pump();

  return {
    urls,
    skipped: false,
    reason,
    done,
    cancel(reasonText = 'Preload cancelled') {
      controller.abort(new DOMException(reasonText, 'AbortError'));
    },
  };
}
