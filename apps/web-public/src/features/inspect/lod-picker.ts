import { budgets, type AssetManifest, type LodTier, type Rendition } from '@nastech/api-contracts';
import { selectLod, type LodDecision } from '@nastech/ui-3d/quality';
import { formatMegabytes } from './byte-gate.js';

/**
 * The LOD, the bytes and *why* — surfaced, not hidden.
 *
 * A buyer on a mid-range phone is entitled to know that they are looking at lod1 rather than lod0,
 * and which ceiling made that call, because the resolution is itself a condition claim ("can I read
 * the engraving at this detail?"). This builds the human-facing rows from the manifest's declared
 * sizes and `selectLod`'s decision; it never invents a size or a tier label.
 */

export interface LodOption {
  readonly tier: LodTier;
  readonly bytes: number;
  readonly label: string;
  readonly chosen: boolean;
  readonly fits: boolean;
}

const TIER_LABEL: Record<LodTier, string> = {
  lod0: 'Full detail',
  lod1: 'Balanced detail',
  lod2: 'Light detail',
  poster: 'Photograph only',
};

export function describeLod(decision: LodDecision): string {
  switch (decision.reason) {
    case 'fits':
      return `${TIER_LABEL[decision.tier]} — fits this device's byte ceiling`;
    case 'largest-fitting':
      return `${TIER_LABEL[decision.tier]} — the lightest available, still over the ceiling`;
    case 'no-rendition':
      return 'No 3D model published — only the studio photograph';
  }
}

export function lodOptions(manifest: AssetManifest, decision: LodDecision, limitBytes: number = budgets.sceneLodMaxBytes): LodOption[] {
  const models = manifest.renditions.filter((r): r is Rendition => r.kind === 'MODEL');
  return models.map((r) => ({
    tier: r.lod,
    bytes: r.bytes,
    label: TIER_LABEL[r.lod],
    chosen: r.id === decision.rendition.id,
    fits: r.bytes <= limitBytes,
  }));
}

export function formatLodSummary(decision: LodDecision): string {
  return `${TIER_LABEL[decision.tier]} · ${formatMegabytes(decision.bytes)}`;
}
