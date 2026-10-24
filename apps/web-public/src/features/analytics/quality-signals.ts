/**
 * Quality signals: Core Web Vitals plus the 3D telemetry thresholds, turned into events.
 *
 * Two rules this file enforces rather than merely prefers:
 *
 *  · **An unmeasured field is never a zero.** The scene runtime's own telemetry contract says a field
 *    that was never recorded reads `null` so a gate fails honestly instead of passing on invented
 *    timing. The same discipline applies on the analytics side: a missing LCP emits nothing at all,
 *    because a `0` would read as "fastest page in the fleet" and would make the 170 KB promise look
 *    kept on the devices where it was not measured.
 *  · **The static path is a first-class outcome, not an error state.** `inspect_static_fallback_shown`
 *    is emitted with `static_path_complete`, and a session can complete every funnel with no scene
 *    event in it at all. That is the whole R270 question: if most inspections land here, the capture
 *    programme has to earn its cost against this number, not against a demo.
 *
 * The telemetry shapes live in `@nastech/api-contracts` (next to `LodTier`), so this module names
 * them without importing the scene runtime into the first-paint chunk.
 */
import { budgets } from '@nastech/api-contracts';
import type { GovernorLevel, LodTier, SceneTelemetrySnapshot } from '@nastech/api-contracts';
import type { EventPropsMap } from './events.js';

/* ------------------------------------------------------------------ shared ui-3d vocabulary */

export type { GovernorLevel, SceneTelemetrySnapshot };

export type GlSupport = 'webgl2' | 'webgl1' | 'none';

/* ------------------------------------------------------------------ web vitals */

export type VitalMetric = 'lcp' | 'cls' | 'inp' | 'ttfb' | 'fcp';
export type VitalRating = 'good' | 'needs_improvement' | 'poor';

/**
 * Web Vitals thresholds as published for Core Web Vitals (LCP 2.5 s / 4 s, CLS 0.1 / 0.25, INP 200 /
 * 500 ms, plus FCP and TTFB at their documented "good/poor" pair). Held as data so a change is a
 * visible diff and so `quality-signals.test.ts` can pin a boundary value on each side.
 */
export const VITAL_THRESHOLDS: Readonly<Record<VitalMetric, { readonly good: number; readonly poor: number; readonly unit: 'ms' | 'ratio' }>> = {
  lcp: { good: 2500, poor: 4000, unit: 'ms' },
  fcp: { good: 1800, poor: 3000, unit: 'ms' },
  inp: { good: 200, poor: 500, unit: 'ms' },
  ttfb: { good: 800, poor: 1800, unit: 'ms' },
  cls: { good: 0.1, poor: 0.25, unit: 'ratio' },
};

export function rateVital(metric: VitalMetric, value: number): VitalRating {
  const t = VITAL_THRESHOLDS[metric];
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`rateVital(${metric}): expected a non-negative finite number, got ${value}`);
  if (value <= t.good) return 'good';
  if (value <= t.poor) return 'needs_improvement';
  return 'poor';
}

/** The PerformanceObserver entry types we read; absent ones mean the metric is not measurable here. */
const OBSERVED_ENTRY_TYPES: readonly string[] = ['largest-contentful-paint', 'event', 'paint', 'navigation', 'layout-shift'];

export interface VitalObserverDeps {
  readonly now: () => number;
  /** Emits a validated `vital_recorded` props object; the caller owns consent and the queue. */
  readonly emit: (props: EventPropsMap['vital_recorded']) => void;
  readonly observerFactory?: (callback: (list: { getEntries(): readonly VitalEntry[] }) => void) => { observe: (o: { type: string; buffered?: boolean }) => void; disconnect: () => void };
  readonly supportedEntryTypes?: readonly string[];
  readonly routeClass?: () => EventPropsMap['vital_recorded']['route_class'];
  readonly onDiagnostic?: (message: string) => void;
}

interface VitalEntry {
  readonly entryType: string;
  readonly name?: string;
  readonly startTime?: number;
  readonly duration?: number;
  readonly value?: number;
  readonly loadTime?: number;
  readonly hadRecentChanges?: boolean;
  readonly processingStart?: number;
  readonly processingEnd?: number;
}

export interface VitalObserver {
  start(): void;
  stop(): void;
  /** Metrics the host could not measure, so a dashboard can show "not measured" rather than "fast". */
  unsupported(): readonly VitalMetric[];
}

/**
 * One observer per entry type, mapped to our five metrics. `layout-shift` accumulates, so CLS is
 * emitted once at stop or on a threshold rather than per shift — a per-shift row would let an
 * analytics queue reconstruct a page's DOM churn, which is a fingerprint-shaped side effect of a
 * performance metric.
 */
export function createVitalObserver(deps: VitalObserverDeps): VitalObserver {
  const supported = deps.supportedEntryTypes ?? OBSERVED_ENTRY_TYPES;
  const unavailable: VitalMetric[] = [];
  let clsAccumulator = 0;
  let clsEmitted = false;
  const handles: { disconnect: () => void }[] = [];
  let started = false;

  const typeForMetric: Readonly<Record<VitalMetric, string>> = {
    lcp: 'largest-contentful-paint',
    inp: 'event',
    fcp: 'paint',
    ttfb: 'navigation',
    cls: 'layout-shift',
  };

  function emitOnce(metric: VitalMetric, value: number): void {
    const rating = rateVital(metric, value);
    const routeClass = deps.routeClass?.();
    deps.emit({
      metric,
      rating,
      ...(metric === 'cls' ? { value_ratio: round4(value) } : { value_ms: Math.round(value) }),
      ...(routeClass !== undefined ? { route_class: routeClass } : {}),
    });
  }

  function handle(entries: readonly VitalEntry[]): void {
    for (const entry of entries) {
      switch (entry.entryType) {
        case 'largest-contentful-paint': {
          const v = entry.startTime;
          if (typeof v === 'number' && Number.isFinite(v)) emitOnce('lcp', v);
          break;
        }
        case 'paint': {
          if (entry.name === 'first-contentful-paint' && typeof entry.startTime === 'number') emitOnce('fcp', entry.startTime);
          break;
        }
        case 'navigation': {
          // TTFB = responseStart - navigationStart, which the Performance API gives as `startTime`
          // for a navigation entry relative to timeOrigin.
          if (typeof entry.startTime === 'number') {
            const ttfb = entry.startTime;
            if (Number.isFinite(ttfb) && ttfb > 0) emitOnce('ttfb', ttfb);
          }
          break;
        }
        case 'event': {
          // INP is the *worst* interaction, so each candidate is emitted with its own value and the
          // aggregation happens in the query. `duration` is the processing+presentation total.
          const v = entry.duration;
          if (typeof v === 'number' && v > 0 && entry.hadRecentChanges === false) emitOnce('inp', v);
          break;
        }
        case 'layout-shift': {
          if (entry.hadRecentChanges === true) break;
          const v = entry.value;
          if (typeof v === 'number' && Number.isFinite(v) && v > 0) clsAccumulator += v;
          break;
        }
        default:
          break;
      }
    }
  }

  function flushCls(): void {
    if (clsEmitted || clsAccumulator === 0) return;
    clsEmitted = true;
    emitOnce('cls', clsAccumulator);
  }

  return {
    start() {
      if (started) return;
      started = true;
      if (typeof deps.observerFactory !== 'function') {
        // No PerformanceObserver: report every metric as unmeasured rather than emitting anything.
        unavailable.push(...(Object.keys(typeForMetric) as VitalMetric[]));
        deps.onDiagnostic?.('no PerformanceObserver available: web vitals will report "not measured", never zero');
        return;
      }
      for (const metric of Object.keys(typeForMetric) as VitalMetric[]) {
        const type = typeForMetric[metric];
        if (!supported.includes(type)) {
          unavailable.push(metric);
          continue;
        }
        try {
          const observer = deps.observerFactory((list) => handle(list.getEntries()));
          observer.observe({ type, buffered: true });
          handles.push(observer);
        } catch {
          // Safari < 15.4 throws on `observe({type:'event'})`, which is precisely the device class the
          // pilot will meet. The metric goes on the unsupported list, the rest keep working.
          unavailable.push(metric);
          deps.onDiagnostic?.(`observer for ${metric} unavailable on this host`);
        }
      }
    },
    stop() {
      for (const h of handles) {
        try {
          h.disconnect();
        } catch {
          /* already gone */
        }
      }
      handles.length = 0;
      flushCls();
      started = false;
    },
    unsupported: () => [...new Set(unavailable)],
  };
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/* ------------------------------------------------------------------ 3D thresholds */

export interface SceneThresholds {
  /** A scene that is not interactive by now is not "slow", it is the reason a buyer sees the static path. */
  readonly sceneReadyPoorMs: number;
  readonly sceneReadyNeedsMs: number;
  /** Above this many bytes we want to know which LOD was chosen and why it cost that much. */
  readonly bytesNeeds: number;
  readonly bytesPoor: number;
}

/**
 * Defaults are derived, not typed twice: `budgets.sceneLodMaxBytes` is the only authority on the byte
 * ceiling, so a byte threshold here is a fraction of the budget rather than a rival constant.
 */
export const DEFAULT_SCENE_THRESHOLDS: SceneThresholds = {
  sceneReadyNeedsMs: 2500,
  sceneReadyPoorMs: 5000,
  bytesNeeds: Math.round(budgets.sceneLodMaxBytes * 0.5),
  bytesPoor: budgets.sceneLodMaxBytes,
};

export type SceneVerdict = 'never_recorded' | 'ok' | 'needs_improvement' | 'poor' | 'context_lost' | 'over_budget';

/**
 * The honest read of one scene session. `never_recorded` is a distinct answer from `ok`: a scene that
 * mounted but never marked `scene-ready` is the failure mode a happy-path dashboard hides.
 */
export function judgeScene(snapshot: SceneTelemetrySnapshot | null, thresholds: SceneThresholds = DEFAULT_SCENE_THRESHOLDS): SceneVerdict {
  if (snapshot === null) return 'never_recorded';
  if (snapshot.contextLost) return 'context_lost';
  if (snapshot.bytesFetched > thresholds.bytesPoor) return 'over_budget';
  const ready = snapshot.sceneReadyMs;
  if (ready === null) return 'never_recorded';
  if (ready > thresholds.sceneReadyPoorMs) return 'poor';
  if (ready > thresholds.sceneReadyNeedsMs) return 'needs_improvement';
  return 'ok';
}

export interface SceneOutcomeInput {
  readonly listingRef: string;
  readonly telemetry: SceneTelemetrySnapshot | null;
  /** Present when the buyer landed on the static path — the reason and whether it was complete. */
  readonly fallback?: { readonly reason: EventPropsMap['inspect_static_fallback_shown']['reason']; readonly complete: boolean; readonly poster?: boolean; readonly turntable?: boolean; readonly disclosures?: boolean; readonly frames?: number };
  /** Present when the byte gate refused before fetching. */
  readonly refusal?: { readonly requestedBytes: number; readonly verdict: EventPropsMap['scene_budget_refused']['verdict']; readonly lodTier: LodTier; readonly renditionCount?: number };
  readonly glCapability?: GlSupport;
}

export interface SceneOutcomeEmit {
  readonly telemetry?: (props: EventPropsMap['scene_telemetry']) => void;
  readonly fallback?: (props: EventPropsMap['inspect_static_fallback_shown']) => void;
  readonly refusal?: (props: EventPropsMap['scene_budget_refused']) => void;
  readonly contextLost?: (props: EventPropsMap['scene_context_lost']) => void;
}

/**
 * The single place the three scene events are derived from one mount, so a feature cannot emit a
 * `scene_telemetry` row that contradicts its own `inspect_static_fallback_shown` row.
 *
 * Returns which events it decided to emit, which is what `funnels.test.ts` uses to prove the static
 * path is a *complete* outcome: `emitted.fallback === true` and `emitted.telemetry === false` is the
 * shape of a session that never had 3D and still bought something.
 */
export function emitSceneOutcome(input: SceneOutcomeInput, emit: SceneOutcomeEmit): {
  readonly telemetry: boolean;
  readonly fallback: boolean;
  readonly refusal: boolean;
  readonly contextLost: boolean;
} {
  const result = { telemetry: false, fallback: false, refusal: false, contextLost: false };

  if (input.refusal !== undefined) {
    emit.refusal?.({
      listing_ref: input.listingRef,
      requested_bytes: Math.max(0, Math.round(input.refusal.requestedBytes)),
      verdict: input.refusal.verdict,
      lod_tier: input.refusal.lodTier,
      ...(input.refusal.renditionCount !== undefined ? { rendition_count: input.refusal.renditionCount } : {}),
    });
    result.refusal = true;
  }

  if (input.telemetry !== null) {
    emit.telemetry?.(telemetryProps(input.listingRef, input.telemetry));
    result.telemetry = true;
    if (input.telemetry.contextLost) {
      emit.contextLost?.({ listing_ref: input.listingRef, recovered_via_static: input.fallback?.complete === true });
      result.contextLost = true;
    }
  }

  if (input.fallback !== undefined) {
    emit.fallback?.({
      listing_ref: input.listingRef,
      reason: input.fallback.reason,
      static_path_complete: input.fallback.complete,
      ...(input.fallback.poster !== undefined ? { had_poster: input.fallback.poster } : {}),
      ...(input.fallback.turntable !== undefined ? { had_turntable: input.fallback.turntable } : {}),
      ...(input.fallback.disclosures !== undefined ? { had_disclosures: input.fallback.disclosures } : {}),
      ...(input.fallback.frames !== undefined ? { turntable_frames: input.fallback.frames } : {}),
    });
    result.fallback = true;
  }

  return result;
}

export function telemetryProps(listingRef: string, snapshot: SceneTelemetrySnapshot): EventPropsMap['scene_telemetry'] {
  return {
    listing_ref: listingRef,
    // A null here means "the scene never marked it", and the schema allows the null precisely so this
    // line can say that instead of inventing a number.
    first_paint_ms: snapshot.firstPaintMs === null ? null : Math.round(snapshot.firstPaintMs),
    scene_ready_ms: snapshot.sceneReadyMs === null ? null : Math.round(snapshot.sceneReadyMs),
    governor_level: snapshot.governorLevel,
    lod_tier: snapshot.lodTier,
    bytes_fetched: Math.max(0, Math.round(snapshot.bytesFetched)),
    context_lost: snapshot.contextLost,
  };
}
