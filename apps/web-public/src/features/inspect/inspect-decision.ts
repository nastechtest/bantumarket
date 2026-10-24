import type { AssetManifest } from '@nastech/api-contracts';
import { canFetchScene, type Capability } from '@nastech/ui-3d/quality';
import { gateBytes, type ByteGate } from './byte-gate.js';
import { qualityTier, type TierDecision } from './quality-tier.js';

/**
 * The single entry decision for the inspect surface: scene or complete-static, and *why*.
 *
 * Pure — no DOM, no GL, no fetch — so every branch is unit-testable, and so the exact same function
 * a route calls could be called by the fence's chunk analysis without side effects. Rule 1 lives
 * here: any non-`scene` outcome still yields the full static path, never a spinner or a grey box.
 *
 * Gate order mirrors `SceneHost`/`planScene` (capability → budget) but adds the product rule the
 * ui-3d capability gate does not check: reduced motion takes the static path outright.
 */

export type StaticReason = 'reduced-motion' | 'save-data' | 'no-webgl' | 'over-budget' | 'no-model-rendition' | 'connection';

export type InspectPlan =
  | { readonly mode: 'scene'; readonly gate: Extract<ByteGate, { fetch: true }>; readonly tier: TierDecision }
  | { readonly mode: 'static'; readonly reason: StaticReason; readonly gate: ByteGate | null; readonly tier: TierDecision };

/** One sentence, buyer-facing, for each reason. Never an apology — the static path is the record. */
export const STATIC_REASON_TEXT: Readonly<Record<StaticReason, string>> = {
  'reduced-motion': 'Motion is reduced on this device, so the photographs and written condition notes are shown.',
  'save-data': 'Data saving is on, so the large 3D model is not downloaded. The photographs are the same record.',
  'no-webgl': 'This browser cannot display 3D. The photographs and written condition notes are shown instead.',
  'over-budget': 'The 3D model is larger than the download this connection can carry. The photographs are shown instead.',
  'no-model-rendition': 'No 3D model exists for this item yet. The photographs and written condition notes are the full record.',
  connection: 'This connection is too slow for a smooth 3D view, so the photographs are shown. The written notes are unchanged.',
};

export function decideInspect(cap: Capability, manifest: AssetManifest): InspectPlan {
  const tier = qualityTier(cap);

  // Reduced motion is a product rule (the scene spins), independent of raw capability.
  if (cap.prefersReducedMotion) {
    return { mode: 'static', reason: 'reduced-motion', gate: null, tier };
  }
  // `canFetchScene` folds save-data, gl:'none', slow-2g/2g and <2 GB into one boolean. We keep it as
  // the authoritative gate, then name the specific reason so the one-line text is honest.
  if (!canFetchScene(cap)) {
    return { mode: 'static', reason: staticReasonForCapability(cap), gate: null, tier };
  }

  const gate = gateBytes(manifest);
  if (gate.lod.reason === 'no-rendition') {
    return { mode: 'static', reason: 'no-model-rendition', gate, tier };
  }
  if (!gate.fetch) {
    return { mode: 'static', reason: 'over-budget', gate, tier };
  }
  return { mode: 'scene', gate, tier };
}

/** Decompose `canFetchScene`'s lumped false into the most specific reason, in the order it checks. */
function staticReasonForCapability(cap: Capability): StaticReason {
  if (cap.gl === 'none') return 'no-webgl';
  if (cap.saveData) return 'save-data';
  if (cap.effectiveConnection === 'slow-2g' || cap.effectiveConnection === '2g') return 'connection';
  return 'connection';
}
