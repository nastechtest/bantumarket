import { useMemo } from 'react';
import type { GovernorLevel } from './frame-governor.js';
import type { LodTier } from '@nastech/api-contracts';

/**
 * 3D telemetry (07 §4.1 `viewer/`).
 *
 * These are the numbers gate D1's device test reads — first paint, scene ready, the level the
 * governor settled on, the LOD chosen, bytes fetched. They must be real measurements from an
 * injected clock, not optimistic defaults: a field that was never recorded reads `null`, and a
 * gate that sees `null` fails honestly instead of passing on invented timing.
 */

export type TelemetryMark = 'first-paint' | 'scene-ready';

export interface SceneTelemetrySnapshot {
  readonly firstPaintMs: number | null;
  readonly sceneReadyMs: number | null;
  readonly governorLevel: GovernorLevel | null;
  readonly lodTier: LodTier | null;
  readonly bytesFetched: number;
  readonly contextLost: boolean;
}

export interface TelemetryCollector {
  /** Records the time of `mark` relative to collector creation. First mark wins; repeats ignored. */
  mark(name: TelemetryMark): void;
  setGovernorLevel(level: GovernorLevel): void;
  setLodTier(tier: LodTier): void;
  /** Additive: streamed chunks report their own deltas. */
  addBytesFetched(bytes: number): void;
  markContextLost(): void;
  snapshot(): SceneTelemetrySnapshot;
}

export interface TelemetryCollectorOptions {
  readonly now?: () => number;
}

export function createTelemetryCollector(options: TelemetryCollectorOptions = {}): TelemetryCollector {
  const now = options.now ?? ((): number => {
    const scope = globalThis as { performance?: { now(): number } };
    return scope.performance?.now() ?? Date.now();
  });
  const origin = now();

  let firstPaintMs: number | null = null;
  let sceneReadyMs: number | null = null;
  let governorLevel: GovernorLevel | null = null;
  let lodTier: LodTier | null = null;
  let bytesFetched = 0;
  let contextLost = false;

  return {
    mark(name) {
      const elapsed = now() - origin;
      if (name === 'first-paint') {
        if (firstPaintMs === null) firstPaintMs = elapsed;
      } else {
        if (sceneReadyMs === null) sceneReadyMs = elapsed;
      }
    },
    setGovernorLevel(level) {
      governorLevel = level;
    },
    setLodTier(tier) {
      lodTier = tier;
    },
    addBytesFetched(bytes) {
      if (!Number.isFinite(bytes) || bytes < 0) {
        throw new TypeError(`telemetry: bytesFetched delta must be a non-negative number, got ${bytes}`);
      }
      bytesFetched += bytes;
    },
    markContextLost() {
      contextLost = true;
    },
    snapshot() {
      return { firstPaintMs, sceneReadyMs, governorLevel, lodTier, bytesFetched, contextLost };
    },
  };
}

/** Stable-per-mount collector for the host; the collector's origin is the component's mount time. */
export function useTelemetryCollector(options?: TelemetryCollectorOptions): TelemetryCollector {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- options is read once by design: the
  // collector must not re-origin mid-session or first-paint timing silently restarts.
  return useMemo(() => createTelemetryCollector(options), []);
}
