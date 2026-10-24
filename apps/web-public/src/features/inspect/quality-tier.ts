import { devicePixelRatioCap, type Capability } from '@nastech/ui-3d/quality';

/**
 * Quality tier driven purely by the device capability object.
 *
 * KNOWN OPEN ISSUE, deliberately not inherited: `@nastech/ui-3d/scene`'s `levelFor()` reads
 * `sceneTokens.maxPixelsPerSecondBudget` as literal device-pixels-per-*second*, which classifies an
 * ordinary 300x300@DPR2 canvas as `static`. That number is a *repaint-rate* budget, not a gate on
 * whether a real inspection surface may render, so the inspect tier here is computed from what the
 * device reports — memory, cores, connection, save-data, DPR — and never from px/s. The scene is
 * still presentable; only its sustained frame cadence and texture size change with the tier.
 *
 * The controller owns the px/s token; this module exists so the buyer-facing tier does not depend
 * on an unresolved reading of it. See brief-13 report, "findings for the controller".
 */

export type InspectTier = 'full' | 'balanced' | 'lite';

export interface TierDecision {
  readonly tier: InspectTier;
  /** Max texture edge the loader should request for this device, in px. */
  readonly textureSizePx: number;
  /** DPR ceiling for the canvas, taken from `devicePixelRatioCap` — the one number we reuse. */
  readonly dprCap: number;
  /** Plain-language why, for the quality readout ("Balanced — 3 GB device"). */
  readonly reason: string;
}

const TEXTURE_BY_TIER: Record<InspectTier, number> = { full: 2048, balanced: 1024, lite: 512 };

/**
 * Coarse-to-fine from the capability, weakest signal wins. `saveData` and `gl:'none'` never reach
 * here — they take the static path — but we still floor them to `lite` so this stays a total
 * function if a caller uses it independently of the gate.
 */
export function qualityTier(cap: Capability): TierDecision {
  const dprCap = devicePixelRatioCap(cap);
  let tier: InspectTier = 'full';
  let reason = 'Full detail on this device';

  const slowConnection = cap.effectiveConnection === '3g';
  const weakMemory = cap.deviceMemoryGb !== null && cap.deviceMemoryGb <= 4;
  const fewCores = cap.hardwareConcurrency <= 4;

  if (cap.saveData || cap.gl === 'none' || cap.effectiveConnection === '2g' || cap.effectiveConnection === 'slow-2g') {
    tier = 'lite';
    reason = 'Data-saving or limited connection — minimal detail';
  } else if (weakMemory || (slowConnection && fewCores)) {
    tier = 'balanced';
    reason = weakMemory ? `Balanced — ${cap.deviceMemoryGb} GB device` : 'Balanced — slower connection and few cores';
  } else if (fewCores) {
    tier = 'balanced';
    reason = 'Balanced — limited processor cores';
  }

  return { tier, textureSizePx: TEXTURE_BY_TIER[tier], dprCap, reason };
}
