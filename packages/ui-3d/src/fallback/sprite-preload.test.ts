import { describe, expect, it } from 'bun:test';
import { preloadFrameStrip, type ImageLoader } from './sprite-preload.js';
import { deriveFrameStrip, preloadableUrls } from './frame-strip.js';
import { manifest, sourced } from './test-fixtures.js';

interface Recorder {
  readonly urls: string[];
  readonly signals: AbortSignal[];
  loader: ImageLoader;
}

function recordingLoader(behavior: 'resolve' | 'reject' | 'never' = 'resolve'): Recorder {
  const rec: Recorder = {
    urls: [],
    signals: [],
    loader: (url, signal) => {
      rec.urls.push(url);
      rec.signals.push(signal);
      if (behavior === 'reject') return Promise.reject(new Error(`no bytes for ${url}`));
      // 'never' leaves the frame in flight so abort semantics can be observed.
      return behavior === 'never' ? new Promise<void>(() => {}) : Promise.resolve();
    },
  };
  return rec;
}

const sheet = deriveFrameStrip(manifest())!;
const perFrame = deriveFrameStrip(
  manifest({
    sprite: null,
    renditions: [
      sourced('f0', 'SPRITE') as never,
      sourced('f1', 'SPRITE') as never,
      sourced('f2', 'SPRITE') as never,
    ],
  }),
)!;

describe('preloadFrameStrip', () => {
  it('asks for exactly the bytes the sprite will paint, and nothing else', () => {
    const rec = recordingLoader();
    const handle = preloadFrameStrip(perFrame, { loadImage: rec.loader, concurrency: 3 });
    expect(rec.urls).toEqual([...preloadableUrls(perFrame)]);
    expect(handle.urls).toEqual(['/signed/f0', '/signed/f1', '/signed/f2']);
  });

  it('fetches a sprite sheet once, not once per frame', () => {
    const rec = recordingLoader();
    preloadFrameStrip(sheet, { loadImage: rec.loader });
    expect(rec.urls).toEqual(['/signed/ren_sprite']);
  });

  it('does not burn the buyer’s allowance when save-data is on', () => {
    const rec = recordingLoader();
    const handle = preloadFrameStrip(perFrame, { loadImage: rec.loader, saveData: true });
    // The assertion that matters is on the transport, not on the returned value.
    expect(rec.urls).toEqual([]);
    expect(handle.skipped).toBe(true);
    expect(handle.reason).toBe('save-data');
  });

  it('skips cleanly when there is no strip to preload', () => {
    const rec = recordingLoader();
    const handle = preloadFrameStrip(null, { loadImage: rec.loader });
    expect(rec.urls).toEqual([]);
    expect(handle.reason).toBe('no-frames');
  });

  it('starts nothing when the caller’s signal is already aborted', () => {
    const controller = new AbortController();
    controller.abort();
    const rec = recordingLoader();
    const handle = preloadFrameStrip(perFrame, { loadImage: rec.loader, signal: controller.signal });
    expect(rec.urls).toEqual([]);
    expect(handle.reason).toBe('already-aborted');
  });

  it('cancels before the remaining frames start, so walking away stops the download', async () => {
    const rec = recordingLoader('never');
    const handle = preloadFrameStrip(perFrame, { loadImage: rec.loader, concurrency: 1 });
    expect(rec.urls).toEqual(['/signed/f0']);
    handle.cancel('buyer left the page');
    const result = await handle.done;
    expect(rec.urls).toEqual(['/signed/f0']);
    expect(result.cancelled).toBe(true);
    expect(result.notAttempted).toBe(2);
    expect(result.loaded).toBe(0);
  });

  it('propagates the caller’s abort into the frames already in flight', async () => {
    const controller = new AbortController();
    const rec = recordingLoader('never');
    const handle = preloadFrameStrip(perFrame, { loadImage: rec.loader, signal: controller.signal, concurrency: 1 });
    controller.abort();
    expect(rec.signals[0]!.aborted).toBe(true);
    expect((await handle.done).cancelled).toBe(true);
  });

  it('reports a failed frame as a failure and still tries the rest', async () => {
    const rec = recordingLoader('reject');
    const handle = preloadFrameStrip(perFrame, { loadImage: rec.loader, concurrency: 3 });
    const result = await handle.done;
    expect(result.failed).toBe(3);
    expect(result.loaded).toBe(0);
    expect(result.cancelled).toBe(false);
    expect(rec.urls).toHaveLength(3);
  });

  it('resolves when every frame landed', async () => {
    const rec = recordingLoader();
    const handle = preloadFrameStrip(perFrame, { loadImage: rec.loader, concurrency: 2 });
    const result = await handle.done;
    expect(result).toEqual({ loaded: 3, failed: 0, cancelled: false, notAttempted: 0 });
    expect(rec.urls).toHaveLength(3);
  });
});
