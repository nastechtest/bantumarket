/**
 * Load progress (07 §4.1 `loading/`).
 *
 * A determinate bar needs a real denominator. Guessing one turns the bar into theatre, and worse, it
 * reports confidence the client has not earned — so when the byte count is unknown the state says
 * "unknown", in the accessible name as well as in the visuals.
 */

export interface LoadProgress {
  readonly receivedBytes: number;
  /** Null when nobody declared a size; that is a real answer, not a missing one. */
  readonly totalBytes: number | null;
  readonly percent: number | null;
  readonly indeterminate: boolean;
  readonly ariaValueText: string;
}

const KB = 1024;
const MB = 1024 * KB;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / KB).toFixed(0)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

/** Reads a `Content-Length` header without pretending a bad one is a size. */
export function declaredBytes(contentLength: string | null | undefined): number | null {
  if (contentLength === null || contentLength === undefined) return null;
  const parsed = Number.parseInt(contentLength, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * `declaredTotal` is the manifest's figure and wins over the header; the header is the fallback when
 * the manifest was coy. Anything else is indeterminate.
 */
export function computeProgress(receivedBytes: number, declaredTotal: number | null): LoadProgress {
  const received = Math.max(0, Number.isFinite(receivedBytes) ? receivedBytes : 0);
  if (declaredTotal === null || !Number.isFinite(declaredTotal) || declaredTotal <= 0) {
    return {
      receivedBytes: received,
      totalBytes: null,
      percent: null,
      indeterminate: true,
      ariaValueText: `Downloading the 3D model — ${formatBytes(received)} so far, total size unknown`,
    };
  }
  // Clamped at 100 so a gzip-vs-Content-Length mismatch cannot render a bar that is 118% done.
  const percent = Math.min(100, Math.round((received / declaredTotal) * 100));
  return {
    receivedBytes: received,
    totalBytes: declaredTotal,
    percent,
    indeterminate: false,
    ariaValueText: `Downloading the 3D model — ${formatBytes(received)} of ${formatBytes(declaredTotal)}, ${percent}%`,
  };
}

export interface ProgressStreamOptions {
  readonly signal?: AbortSignal;
  /** The byte source. Required so a progress bar can only ever be driven by real arrivals. */
  readonly read: (onChunk: (byteLength: number) => void, signal?: AbortSignal) => Promise<void>;
}

/**
 * Turns a byte stream into progress. Chunk sizes come from the decoder, so a truncated transfer
 * reports the truncation instead of quietly completing.
 */
export async function trackProgress(
  onUpdate: (progress: LoadProgress) => void,
  declaredTotal: number | null,
  options: ProgressStreamOptions & { readonly onBytes?: (count: number) => void },
): Promise<LoadProgress> {
  let received = 0;
  const emit = () => onUpdate(computeProgress(received, declaredTotal));
  emit();

  await options.read((byteLength) => {
    if (options.signal?.aborted) return;
    received += Math.max(0, byteLength);
    options.onBytes?.(byteLength);
    emit();
  }, options.signal);

  return computeProgress(received, declaredTotal);
}

/** Convenience: wrap a `fetch` Response so both the header and the stream are accounted for. */
export function progressFromResponse(
  response: { body?: { getReader(): unknown } | null; headers?: { get(name: string): string | null } },
  declaredTotal: number | null,
  onUpdate: (progress: LoadProgress) => void,
  options: { readonly signal?: AbortSignal } = {},
): Promise<LoadProgress> {
  const total = declaredTotal ?? declaredBytes(response.headers?.get('Content-Length') ?? null);
  return trackProgress(
    onUpdate,
    total,
    {
      ...(options.signal ? { signal: options.signal } : {}),
      read: async (onChunk, signal) => {
        const reader = response.body?.getReader?.() as
          | { read(): Promise<{ done?: boolean; value?: { byteLength?: number; length?: number } }>; cancel?: () => void }
          | undefined;
        if (!reader) return;
        for (;;) {
          if (signal?.aborted) {
            reader.cancel?.();
            return;
          }
          const chunk = await reader.read();
          if (chunk.done) return;
          onChunk(chunk.value?.byteLength ?? chunk.value?.length ?? 0);
        }
      },
    },
  );
}
