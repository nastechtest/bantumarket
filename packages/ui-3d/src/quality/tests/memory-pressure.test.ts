import { describe, expect, it } from 'bun:test';
import { budgets } from '@nastech/api-contracts';
import type { LodTier } from '@nastech/api-contracts';
import { checkByteBudget } from '../lod-selection.js';
import {
  budgetOk,
  clampTextureSize,
  estimatedBytesFor,
  residentCeilingBytes,
  MEMORY_MODEL,
  TRIANGLE_TARGETS,
} from '../memory-pressure.js';
import type { Capability } from '../capability.js';

/** The reference pilot device: a mid-range Android with 2 GB. WebGL2 and 4G, so the connection is
 *  not the problem — the RAM is. */
function device(deviceMemoryGb: number | null, over: Partial<Capability> = {}): Capability {
  return {
    gl: 'webgl2',
    maxTextureSize: 8192,
    deviceMemoryGb,
    hardwareConcurrency: 8,
    effectiveConnection: '4g',
    saveData: false,
    prefersReducedMotion: false,
    coarsePointer: true,
    ...over,
  };
}

const TWO_GB = device(2);
const FOUR_GB = device(4);
const UNKNOWN = device(null);

const LOD0_SIZES: ReadonlyArray<[LodTier, number]> = [
  ['lod0', 2048],
  ['lod1', 1024],
  ['lod2', 512],
];

describe('memory pressure: the estimate', () => {
  it('prices a tier from triangles and texture area, and grows with both', () => {
    const small = estimatedBytesFor('lod0', 1024);
    const large = estimatedBytesFor('lod0', 2048);
    expect(large.residentBytes).toBeGreaterThan(small.residentBytes);
    expect(large.textureBytes / small.textureBytes).toBe(4);

    const decimated = estimatedBytesFor('lod0', 2048, { triangles: TRIANGLE_TARGETS.lod1 });
    expect(decimated.residentBytes).toBeLessThan(large.residentBytes);
    expect(decimated.geometryBytes).toBe(Math.round(TRIANGLE_TARGETS.lod1 * MEMORY_MODEL.bytesPerTriangle));
  });

  it('is the decoded footprint, not the file size — orders of magnitude apart', () => {
    // 2.1 MB of DRACO on the wire, and that is the *small* end once three maps are uploaded.
    const wireBytes = 2_100_000;
    const estimate = estimatedBytesFor('lod0', 2048, { transferBytes: wireBytes });
    expect(estimate.residentBytes).toBeGreaterThan(wireBytes * 20);
    expect(checkByteBudget(wireBytes, budgets.sceneLodMaxBytes).ok).toBe(true);
  });

  it('reports nothing but integers, so two runs of the same manifest agree', () => {
    const estimate = estimatedBytesFor('lod0', 2048, { transferBytes: 2_100_000 });
    for (const value of [
      estimate.residentBytes,
      estimate.textureBytes,
      estimate.geometryBytes,
      estimate.triangles,
      estimate.textureSizePx,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('a poster is texture only', () => {
    const poster = estimatedBytesFor('poster', 1200);
    expect(poster.geometryBytes).toBe(0);
    expect(poster.residentBytes).toBe(poster.textureBytes);
  });

  it('a nonsense texture size cannot produce a negative or fractional estimate', () => {
    const zero = estimatedBytesFor('lod2', -5);
    expect(zero.textureBytes).toBe(0);
    expect(zero.residentBytes).toBe(zero.geometryBytes);
    expect(estimatedBytesFor('lod2', 1024.6).textureSizePx).toBe(1025);
  });
});

describe('memory pressure: the device gate', () => {
  it('refuses lod0 on a 2 GB device that the byte budget passes', () => {
    const estimate = estimatedBytesFor('lod0', 2048, { transferBytes: 2_100_000 });

    // The two guards disagree, and that is the design working: one measures the wire, one the tab.
    expect(checkByteBudget(estimate.transferBytes!, budgets.sceneLodMaxBytes).ok).toBe(true);
    expect(estimate.residentBytes).toBeLessThan(residentCeilingBytes(TWO_GB)!);

    const verdict = budgetOk(estimate, TWO_GB);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('device-memory-floor');
    expect(verdict.fallbackTier).toBe('lod1');
  });

  it('refuses it at the 3 GB boundary and allows it above', () => {
    const estimate = estimatedBytesFor('lod0', 2048, { transferBytes: 2_100_000 });
    expect(budgetOk(estimate, device(MEMORY_MODEL.lod0MinDeviceMemoryGb)).ok).toBe(false);
    expect(budgetOk(estimate, FOUR_GB).ok).toBe(true);
    expect(budgetOk(estimate, FOUR_GB).reason).toBe('allow');
  });

  it('the floor is only lod0 — a 2 GB phone still gets lod1 and lod2', () => {
    for (const [tier, texture] of LOD0_SIZES.slice(1)) {
      const verdict = budgetOk(estimatedBytesFor(tier, texture, { transferBytes: 900_000 }), TWO_GB);
      expect(verdict.ok).toBe(true);
    }
  });

  it('refuses a scene that will not fit in the tab even on a big device', () => {
    const estimate = estimatedBytesFor('lod0', 8192);
    const verdict = budgetOk(estimate, device(6));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('resident-ceiling');
    expect(estimate.residentBytes).toBeGreaterThan(residentCeilingBytes(device(6))!);
  });

  it('the renderer-process clamp bites before the RAM share on a laptop', () => {
    const laptop = device(16);
    expect(residentCeilingBytes(laptop)).toBe(MEMORY_MODEL.rendererProcessClampBytes);
    expect(residentCeilingBytes(TWO_GB)).toBeLessThan(MEMORY_MODEL.rendererProcessClampBytes);
  });

  it('refuses a transfer the payload budget already refuses, and says so', () => {
    const estimate = estimatedBytesFor('lod1', 1024, { transferBytes: budgets.sceneLodMaxBytes + 1 });
    const verdict = budgetOk(estimate, FOUR_GB);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('payload-budget');
    expect(verdict.fallbackTier).toBe('lod2');
  });

  it('an unreported device memory is an assumption, not a pass', () => {
    // Safari never reports deviceMemory. Refusing lod0 there would take 3D away from every iPhone,
    // so the guard falls back to the byte budget and flags the assumption instead of hiding it.
    const estimate = estimatedBytesFor('lod0', 2048, { transferBytes: 2_100_000 });
    const verdict = budgetOk(estimate, UNKNOWN);
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toBe('device-unreported');
    expect(verdict.ceilingBytes).toBeNull();
  });

  it('an unreported device still refuses an oversized transfer', () => {
    const estimate = estimatedBytesFor('lod0', 2048, { transferBytes: 4_000_000 });
    expect(budgetOk(estimate, UNKNOWN).ok).toBe(false);
  });

  it('a refusal always names something to ask for instead', () => {
    const refused = budgetOk(estimatedBytesFor('lod0', 2048, { transferBytes: 2_100_000 }), TWO_GB);
    expect(refused.ok).toBe(false);
    expect(refused.fallbackTier).toBe('lod1');
    const lastResort = budgetOk(estimatedBytesFor('poster', 1200), TWO_GB);
    expect(lastResort.ok).toBe(true);
    expect(lastResort.fallbackTier).toBe('poster');
  });

  it('the whole chain is refused in order on a 2 GB device: lod0 out, lod1 in', () => {
    const tiers: LodTier[] = ['lod0', 'lod1', 'lod2'];
    const verdicts = tiers.map((tier) => budgetOk(estimatedBytesFor(tier, tier === 'lod0' ? 2048 : 1024), TWO_GB));
    expect(verdicts.map((v) => v.ok)).toEqual([false, true, true]);
  });
});

describe('memory pressure: texture ceilings', () => {
  it('clamps by device class, not by what the driver can technically do', () => {
    expect(clampTextureSize(4096, TWO_GB)).toBe(MEMORY_MODEL.textureCeilingByRamGb.low);
    expect(clampTextureSize(4096, device(4))).toBe(MEMORY_MODEL.textureCeilingByRamGb.mid);
    expect(clampTextureSize(4096, device(8))).toBe(MEMORY_MODEL.textureCeilingByRamGb.high);
  });

  it('never exceeds what the GL context reported', () => {
    const weak = device(8, { maxTextureSize: 2048 });
    expect(clampTextureSize(4096, weak)).toBe(2048);
  });

  it('serves the request when it is already smaller than every ceiling', () => {
    expect(clampTextureSize(512, FOUR_GB)).toBe(512);
  });

  it('a device that reports no texture size does not disable the memory ceiling', () => {
    const noQuery = device(2, { maxTextureSize: 0 });
    expect(clampTextureSize(4096, noQuery)).toBe(MEMORY_MODEL.textureCeilingByRamGb.low);
  });

  it('an unreported device gets the desktop ceiling, never zero', () => {
    expect(clampTextureSize(8192, UNKNOWN)).toBe(MEMORY_MODEL.textureCeilingByRamGb.high);
    expect(clampTextureSize(0, FOUR_GB)).toBe(1);
  });
});
