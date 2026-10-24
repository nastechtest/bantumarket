/**
 * Texture byte budget.
 *
 * Geometry is only half a model. A 2048² RGBA texture is 16.8 MB uncompressed before mipmaps, which
 * is six times the entire scene budget; the client's byte guard would refuse the fetch, or worse,
 * a phone would decode it and die. So texture size is checked as arithmetic per tier, including the
 * mip chain, against a share of the same contract budget the model tiers use.
 *
 * The tier dimensions come from `TEXTURE_PX_BY_TIER` in rendition-gen so the build command and this
 * gate cannot disagree about what "lod1" means.
 */

import { budgets } from '@nastech/api-contracts';
import type { LodTier } from '@nastech/api-contracts';
import { inputInvalid } from '../errors.js';
import { TEXTURE_PX_BY_TIER } from '../rendition-gen.js';

/** Textures may take at most this share of the per-tier byte ceiling. The rest is geometry. */
export const TEXTURE_SHARE_OF_TIER = 0.6;

/**
 * Resident decoded ceiling for one texture on a low-memory phone. This is a device fact, not a
 * payload budget, so it lives here rather than in api-contracts; 32 MiB is a 2048² RGBA image with
 * a full mip chain plus headroom.
 */
export const MAX_RESIDENT_TEXTURE_BYTES = 32 * 1024 * 1024;

export type TextureChannelCount = 1 | 2 | 3 | 4;

export interface TextureSpec {
  readonly id: string;
  readonly tier: Exclude<LodTier, 'poster'>;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly channels: TextureChannelCount;
  readonly mipmaps: boolean;
  /** Bytes on the wire after KTX2/Basis or WebP encoding — what the budget gate counts. */
  readonly encodedBytes: number;
}

export interface TextureBudget {
  readonly tier: Exclude<LodTier, 'poster'>;
  readonly maxDimensionPx: number;
  readonly maxBytes: number;
}

export interface TextureReport {
  readonly id: string;
  readonly tier: Exclude<LodTier, 'poster'>;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly bytes: number;
  readonly maxDimensionPx: number;
  readonly maxBytes: number;
  readonly violations: readonly string[];
}

/** The mip chain adds 1/3 of level 0 for power-of-two images; counted rather than ignored. */
export function mipChainBytes(baseBytes: number, mipmaps: boolean): number {
  return mipmaps ? Math.ceil(baseBytes * (4 / 3)) : baseBytes;
}

export function textureBytes(spec: TextureSpec): number {
  if (!Number.isInteger(spec.widthPx) || !Number.isInteger(spec.heightPx) || spec.widthPx <= 0 || spec.heightPx <= 0) {
    throw inputInvalid(`Texture ${spec.id} is ${spec.widthPx}x${spec.heightPx}.`, 'A texture has whole, positive pixel dimensions.');
  }
  if (![1, 2, 3, 4].includes(spec.channels)) throw inputInvalid(`Texture ${spec.id} has ${spec.channels} channels.`, 'Channels are 1–4.');
  return mipChainBytes(spec.widthPx * spec.heightPx * spec.channels, spec.mipmaps);
}

export function budgetForTier(tier: Exclude<LodTier, 'poster'>): TextureBudget {
  const maxDimensionPx = Number(TEXTURE_PX_BY_TIER[tier]);
  const maxBytes = Math.floor(budgets.sceneLodMaxBytes * TEXTURE_SHARE_OF_TIER);
  return { tier, maxDimensionPx, maxBytes };
}

export function checkTextureBudget(specs: readonly TextureSpec[]): readonly TextureReport[] {
  const perTier = new Map<string, number>();
  return Object.freeze(
    specs.map((spec) => {
      const budget = budgetForTier(spec.tier);
      const violations: string[] = [];
      if (spec.widthPx > budget.maxDimensionPx || spec.heightPx > budget.maxDimensionPx) {
        violations.push(`${spec.widthPx}x${spec.heightPx} exceeds the ${budget.maxDimensionPx}px ${spec.tier} limit`);
      }
      // Power-of-two keeps GPU mip generation honest; a 1000px texture is resampled by the driver
      // differently on every phone.
      if (!isPowerOfTwo(spec.widthPx) || !isPowerOfTwo(spec.heightPx)) {
        violations.push(`${spec.widthPx}x${spec.heightPx} is not power-of-two`);
      }
      const bytes = textureBytes(spec);
      const running = (perTier.get(spec.tier) ?? 0) + bytes;
      perTier.set(spec.tier, running);
      if (running > budget.maxBytes) {
        violations.push(`tier ${spec.tier} textures total ${running.toLocaleString('en-ZA')} bytes, over the ${budget.maxBytes.toLocaleString('en-ZA')}-byte share`);
      }
      return {
        id: spec.id,
        tier: spec.tier,
        widthPx: spec.widthPx,
        heightPx: spec.heightPx,
        bytes,
        maxDimensionPx: budget.maxDimensionPx,
        maxBytes: budget.maxBytes,
        violations: Object.freeze(violations),
      };
    }),
  );
}

export function assertTextureBudget(reports: readonly TextureReport[]): void {
  const failed = reports.filter((report) => report.violations.length > 0);
  if (failed.length > 0) {
    throw inputInvalid(
      `Texture budget refused: ${failed.map((r) => `${r.id} (${r.violations.join('; ')})`).join(', ')}.`,
      `Re-bake the texture at the tier's pixel limit (lod0 2048, lod1 1024, lod2 512) with a power-of-two size; textures may take ${(TEXTURE_SHARE_OF_TIER * 100).toFixed(0)} % of the tier ceiling.`,
    );
  }
}

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

export function describeTextureBudget(reports: readonly TextureReport[]): string {
  const total = reports.reduce((sum, report) => sum + report.bytes, 0);
  return `${reports.length} textures, ${total.toLocaleString('en-ZA')} bytes incl. mips, ${reports.filter((r) => r.violations.length > 0).length} over budget.`;
}
