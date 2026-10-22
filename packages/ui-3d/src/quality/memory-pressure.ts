import { budgets } from '@nastech/api-contracts';
import type { LodTier } from '@nastech/api-contracts';
import type { Capability } from './capability.js';

/**
 * GPU / heap pressure guard (07 §4.1 `quality/`).
 *
 * `lod-selection.ts` answers "can this arrive over this connection?". This module answers the
 * different question that the connection cannot answer: "can this device *hold* it once it has
 * arrived?". A 2 MB DRACO mesh is a perfectly reasonable download and, decoded, an uncomfortable
 * number of megabytes of vertex and texture memory — and on a 2 GB phone the operating system does
 * not show a slow spinner, it kills the tab with the buyer's checkout half-typed behind it.
 *
 * This is therefore the one place in the pipeline where a **device**, not a connection, decides —
 * and it is deliberately allowed to refuse an LOD that the byte guard passed. The two guards
 * disagreeing is the design working, not a bug: they measure different resources.
 */

/**
 * Decimation targets per tier, in triangles. These are what the capture pipeline aims to publish
 * (`tooling/asset-pipeline`); a caller holding a real manifest passes the measured count through
 * `estimatedBytesFor`'s options rather than trusting this table. lod0 is deliberately enormous —
 * that is the whole reason a device-side guard exists.
 */
export const TRIANGLE_TARGETS: Readonly<Record<LodTier, number>> = {
  lod0: 420_000,
  lod1: 120_000,
  lod2: 34_000,
  poster: 0,
};

/** Texture sets uploaded per tier: albedo, then the packed normal/roughness, then occlusion. */
export const TEXTURE_MAPS_PER_TIER: Readonly<Record<LodTier, number>> = {
  lod0: 3,
  lod1: 2,
  lod2: 1,
  poster: 1,
};

export const MEMORY_MODEL = {
  /** RGBA8 as uploaded. GPU-compressed formats decode to this unless the device advertises support,
   *  and nothing in the pilot does — so pricing the optimistic case would be pricing a leak. */
  bytesPerTexel: 4,
  /** A full mip chain is ~4/3 of the base level. */
  mipMultiplier: 4 / 3,
  /** 3 vertices x (position 12 + normal 12 + uv 8) + 3 index slots x 4 bytes. Measured, decoded,
   *  in VRAM: DRACO shrinks the download, not this. */
  bytesPerTriangle: 108,
  /** What a single mobile browser tab may hold before the OS reaps the process. Generous readings
   *  of the vendor guidance; the point is the shape of the ceiling, not its last percent. */
  usableRamShare: 0.15,
  /** A 16 GB laptop gets no more room than this: Chrome caps one renderer roughly here whatever the
   *  machine has, so a RAM-scaled ceiling alone would wave through a scene the process cannot hold. */
  rendererProcessClampBytes: 1024 * 1024 * 1024,
  /** Texture ceilings by device class. 4096 on a phone is a texture upload that outlives the tab. */
  textureCeilingByRamGb: { low: 1024, mid: 2048, high: 4096 } as const,
  textureCeilingLowGb: 3,
  textureCeilingMidGb: 6,
  /** The floor that costs an LOD, not a percentage: below this much RAM, the finest tier is refused
   *  outright regardless of how small its bytes are. */
  lod0MinDeviceMemoryGb: 3,
} as const;

export interface EstimateOptions {
  readonly triangles?: number;
  /** The rendition's declared transfer size, when a manifest is in hand. */
  readonly transferBytes?: number;
  readonly textureMaps?: number;
}

export interface ResidentEstimate {
  readonly tier: LodTier;
  readonly textureSizePx: number;
  readonly triangles: number;
  readonly textureMaps: number;
  /** What the scene occupies after decode. This is the number that kills a tab. */
  readonly residentBytes: number;
  readonly geometryBytes: number;
  readonly textureBytes: number;
  /** What the asset costs on the wire, when known. */
  readonly transferBytes: number | null;
}

export type MemoryReason = 'allow' | 'device-unreported' | 'device-memory-floor' | 'resident-ceiling' | 'payload-budget';

export interface MemoryVerdict {
  readonly ok: boolean;
  readonly reason: MemoryReason;
  readonly estimate: ResidentEstimate;
  /** null when the device does not report its RAM (Safari never does) and so has no measurable ceiling. */
  readonly ceilingBytes: number | null;
  readonly residentBytes: number;
  /** What to ask for instead, so the caller has an action and not only a refusal. */
  readonly fallbackTier: LodTier;
}

function gbToBytes(gb: number): number {
  return Math.round(gb * 1024 * 1024 * 1024);
}

/**
 * Resident bytes a scene may occupy on this device, or null when the device is unknown. Unknown is
 * not "unlimited": `budgetOk` still applies the tier floor and the transfer budget, and it reports
 * the assumption rather than hiding it.
 */
export function residentCeilingBytes(cap: Capability): number | null {
  if (cap.deviceMemoryGb === null) return null;
  return Math.round(
    Math.min(
      gbToBytes(cap.deviceMemoryGb) * MEMORY_MODEL.usableRamShare,
      MEMORY_MODEL.rendererProcessClampBytes,
    ),
  );
}

export function estimatedBytesFor(tier: LodTier, textureSizePx: number, options: EstimateOptions = {}): ResidentEstimate {
  const triangles = options.triangles ?? TRIANGLE_TARGETS[tier];
  const maps = options.textureMaps ?? TEXTURE_MAPS_PER_TIER[tier];
  const side = Math.max(0, Math.round(textureSizePx));
  const textureBytes = Math.round(side * side * MEMORY_MODEL.bytesPerTexel * maps * MEMORY_MODEL.mipMultiplier);
  const geometryBytes = Math.round(triangles * MEMORY_MODEL.bytesPerTriangle);
  return {
    tier,
    textureSizePx: side,
    triangles,
    textureMaps: maps,
    textureBytes,
    geometryBytes,
    residentBytes: textureBytes + geometryBytes,
    transferBytes: options.transferBytes ?? null,
  };
}

const FALLBACK_TIER: Readonly<Record<LodTier, LodTier>> = { lod0: 'lod1', lod1: 'lod2', lod2: 'poster', poster: 'poster' };

/**
 * The device gate. Ordered deliberately: the tier floor is checked before the numeric ceiling, so a
 * 2 GB phone is refused `lod0` even though its 107 MB estimate sits comfortably under a 320 MB
 * ceiling — the ceiling models steady-state occupancy and the floor models the decode spike, which
 * is what actually reaps a process.
 */
export function budgetOk(estimate: ResidentEstimate, cap: Capability): MemoryVerdict {
  const ceiling = residentCeilingBytes(cap);
  const base = { estimate, ceilingBytes: ceiling, residentBytes: estimate.residentBytes };
  const fallback = FALLBACK_TIER[estimate.tier];

  if (estimate.transferBytes !== null && estimate.transferBytes > budgets.sceneLodMaxBytes) {
    return { ...base, ok: false, reason: 'payload-budget', fallbackTier: fallback };
  }

  if (
    estimate.tier === 'lod0' &&
    cap.deviceMemoryGb !== null &&
    cap.deviceMemoryGb <= MEMORY_MODEL.lod0MinDeviceMemoryGb
  ) {
    return { ...base, ok: false, reason: 'device-memory-floor', fallbackTier: fallback };
  }

  if (ceiling !== null && estimate.residentBytes > ceiling) {
    return { ...base, ok: false, reason: 'resident-ceiling', fallbackTier: fallback };
  }

  if (cap.deviceMemoryGb === null) return { ...base, ok: true, reason: 'device-unreported', fallbackTier: estimate.tier };

  return { ...base, ok: true, reason: 'allow', fallbackTier: estimate.tier };
}

/**
 * Texture size this device should be served. `cap.maxTextureSize` is what the driver *can* do; the
 * RAM class is what the tab can *survive*, and the smaller of the two wins.
 */
export function clampTextureSize(requestedPx: number, cap: Capability): number {
  const driver = cap.maxTextureSize > 0 ? cap.maxTextureSize : requestedPx;
  const ram = cap.deviceMemoryGb;
  const byMemory =
    ram === null || ram > MEMORY_MODEL.textureCeilingMidGb
      ? MEMORY_MODEL.textureCeilingByRamGb.high
      : ram > MEMORY_MODEL.textureCeilingLowGb
        ? MEMORY_MODEL.textureCeilingByRamGb.mid
        : MEMORY_MODEL.textureCeilingByRamGb.low;
  return Math.max(1, Math.min(Math.round(requestedPx), driver, byMemory));
}
