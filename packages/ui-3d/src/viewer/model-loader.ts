import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Model loader (07 §4.1 `viewer/`).
 *
 * The invariant that shapes this whole module: signed URLs are short-TTL and change every request,
 * so a cache keyed by URL would never hit, and a cache key or log line that CONTAINS the URL is a
 * leak vector for a bucket path. The rendition's `sha256` is the only identity that survives a
 * re-sign — it is the cache key, and URLs appear exactly once, as the input to fetch.
 *
 * A buyer who navigates away must not finish a 2 MB download: `load` returns a handle you can
 * abort, the abort propagates to fetch's AbortSignal, and a half-fetched entry is evicted so the
 * next mount re-fetches rather than awaiting a dead promise.
 */

export interface ModelRenditionRef {
  /** Short-TTL signed URL. Input to the fetch only — never a cache key, never a log line. */
  readonly url: string;
  /** Content hash from the manifest. The cache key. */
  readonly sha256: string;
}

export interface LoadProgress {
  readonly loadedBytes: number;
  readonly totalBytes: number | null;
}

export interface ModelLoadHandle {
  readonly promise: Promise<GLTF>;
  abort(reason?: string): void;
}

export type GlbParser = (bytes: ArrayBuffer) => Promise<GLTF>;

export interface ModelLoaderEvent {
  readonly sha256: string;
  readonly kind: 'fetch-start' | 'fetched' | 'parsed' | 'cache-hit' | 'aborted' | 'failed';
  readonly bytes?: number;
}

export interface ModelLoaderOptions {
  readonly fetchImpl?: typeof fetch;
  readonly parse?: GlbParser;
  readonly log?: (event: ModelLoaderEvent) => void;
  /** Where the DRACO wasm lives, if the app serves it. Absent = DRACO-compressed scenes fail loudly, not silently. */
  readonly dracoDecoderPath?: string;
}

export interface LoadOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: LoadProgress) => void;
}

export interface ModelLoader {
  load(rendition: ModelRenditionRef, options?: LoadOptions): ModelLoadHandle;
  peek(sha256: string): Promise<GLTF> | undefined;
  invalidate(sha256: string): boolean;
  cachedHashes(): readonly string[];
}

async function readWithProgress(
  body: ReadableStream<Uint8Array>,
  onProgress: ((progress: LoadProgress) => void) | undefined,
  totalHint: number | null,
): Promise<ArrayBuffer> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.({ loadedBytes: loaded, totalBytes: totalHint });
    }
  }
  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer.buffer;
}

/**
 * Default parser: GLTFLoader, MeshoptDecoder if it loads (it is a wasm module — an offline device
 * or a stripped bundle may not have it, hence "if available"), DRACO only when the app declared
 * where its decoder lives.
 */
function createDefaultParse(dracoDecoderPath?: string): GlbParser {
  return async (bytes: ArrayBuffer): Promise<GLTF> => {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    try {
      const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
      loader.setMeshoptDecoder(MeshoptDecoder);
    } catch {
      // Meshopt is an if-available compression path, not a hard dependency; the GLB's uncompressed
      // fallbacks still parse. A scene that NEEDS meshopt fails at parse with a clear GLTFLoader error.
    }
    if (dracoDecoderPath) {
      const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');
      const draco = new DRACOLoader();
      draco.setDecoderPath(dracoDecoderPath);
      loader.setDRACOLoader(draco);
    }
    return new Promise<GLTF>((resolve, reject) => {
      loader.parse(bytes, '', resolve, reject);
    });
  };
}

export function createModelLoader(options: ModelLoaderOptions = {}): ModelLoader {
  const cache = new Map<string, Promise<GLTF>>();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const parse = options.parse ?? createDefaultParse(options.dracoDecoderPath);
  const log = options.log;

  function load(rendition: ModelRenditionRef, loadOptions: LoadOptions = {}): ModelLoadHandle {
    const { url, sha256 } = rendition;
    const controller = new AbortController();
    if (loadOptions.signal) {
      if (loadOptions.signal.aborted) controller.abort();
      else loadOptions.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const cached = cache.get(sha256);
    if (cached) {
      log?.({ sha256, kind: 'cache-hit' });
      // Shared in-flight/completed promise: this caller's abort must not kill a download another
      // component registered under the same hash, so abort() here only detaches this caller.
      return { promise: cached, abort: () => undefined };
    }

    log?.({ sha256, kind: 'fetch-start' });
    const promise = (async (): Promise<GLTF> => {
      const response = await fetchImpl(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`rendition ${sha256} fetch failed: HTTP ${response.status}`);
      const lengthHeader = response.headers.get('content-length');
      const totalHint = lengthHeader !== null ? Number(lengthHeader) : null;
      let bytes: ArrayBuffer;
      if (response.body) {
        bytes = await readWithProgress(response.body, loadOptions.onProgress, totalHint);
      } else {
        bytes = await response.arrayBuffer();
        loadOptions.onProgress?.({ loadedBytes: bytes.byteLength, totalBytes: totalHint ?? bytes.byteLength });
      }
      log?.({ sha256, kind: 'fetched', bytes: bytes.byteLength });
      const gltf = await parse(bytes);
      log?.({ sha256, kind: 'parsed', bytes: bytes.byteLength });
      return gltf;
    })();

    cache.set(sha256, promise);
    // An entry that failed or was aborted must not linger: the next mount has to re-fetch, not
    // receive the dead promise.
    void promise.catch(() => {
      if (cache.get(sha256) === promise) cache.delete(sha256);
    });

    let aborted = false;
    return {
      promise,
      abort(reason?: string) {
        if (aborted) return;
        aborted = true;
        controller.abort();
        if (cache.get(sha256) === promise) cache.delete(sha256);
        log?.({ sha256, kind: 'aborted' });
      },
    };
  }

  return {
    load,
    peek: (sha256) => cache.get(sha256),
    invalidate(sha256) {
      return cache.delete(sha256);
    },
    cachedHashes: () => [...cache.keys()],
  };
}
