import { describe, expect, it } from 'bun:test';
import { budgets } from '@nastech/api-contracts';
import type { AssetManifest, Rendition } from '@nastech/api-contracts';
import { guardManifest, guardRendition, preflightGeometry } from './byte-budget-guard.js';

function rendition(id: string, bytes: number, kind: Rendition['kind'] = 'MODEL', lod: Rendition['lod'] = 'lod0'): Rendition {
  return {
    id,
    kind,
    lod,
    bytes,
    sha256: 'dev',
    bucketKey: 'private',
    mime: kind === 'MODEL' ? 'model/gltf-binary' : 'image/jpeg',
  };
}

const MB = 1024 * 1024;

describe('guardRendition', () => {
  it('refuses a 3 MB rendition against the declared 2.5 MB ceiling', () => {
    const guard = guardRendition(rendition('ren_big', 3 * MB));
    expect(guard.allowed).toBe(false);
    if (guard.allowed) throw new Error('expected refusal');
    expect(guard.reason).toBe('over-budget');
    expect(guard.bytes).toBe(3 * MB);
    expect(guard.limitBytes).toBe(budgets.sceneLodMaxBytes);
  });

  it('allows a rendition that fits, and says so without a reason', () => {
    const guard = guardRendition(rendition('ren_ok', 900_000));
    expect(guard.allowed).toBe(true);
  });

  it('refuses an asset with no declared size rather than downloading a number it cannot check', () => {
    for (const bytes of [0, -1, Number.NaN]) {
      const guard = guardRendition(rendition('ren_unknown', bytes));
      expect(guard.allowed).toBe(false);
      if (guard.allowed) continue;
      expect(guard.reason).toBe('undeclared-size');
    }
  });

  it('uses the contract ceiling, never a copied number', () => {
    const exactlyAtLimit = guardRendition(rendition('ren_edge', budgets.sceneLodMaxBytes));
    expect(exactlyAtLimit.allowed).toBe(true);
    const oneByteOver = guardRendition(rendition('ren_over', budgets.sceneLodMaxBytes + 1));
    expect(oneByteOver.allowed).toBe(false);
  });

  it('names the alternative it is handing the buyer, in the refusal itself', () => {
    const guard = guardRendition(rendition('ren_big', 3 * MB));
    if (guard.allowed) throw new Error('expected refusal');
    expect(guard.message).toContain('2.5 MB');
    expect(guard.message).toContain('photographs');
    expect(guard.message).toContain('condition notes');
  });
});

describe('preflightGeometry — the guard runs before the request', () => {
  it('issues ZERO transport calls when the rendition is over budget', async () => {
    const calls: string[] = [];
    const send = async (r: Rendition) => {
      calls.push(r.id);
      return { bytes: r.bytes };
    };
    const result = await preflightGeometry(rendition('ren_big', 3 * MB), send);
    // Not "throws" — nothing was ever asked for. A guard that fires the request and then complains
    // already charged the buyer for the download it claims to have prevented.
    expect(calls).toEqual([]);
    expect(result.guard.allowed).toBe(false);
    expect(result.bytes).toBeUndefined();
  });

  it('does issue the request when the rendition fits', async () => {
    const calls: string[] = [];
    const send = async (r: Rendition) => {
      calls.push(r.id);
      return { bytes: r.bytes };
    };
    const result = await preflightGeometry(rendition('ren_ok', 512_000), send);
    expect(calls).toEqual(['ren_ok']);
    expect(result.bytes).toBe(512_000);
  });

  it('passes the caller’s signal through when it does allow the fetch', async () => {
    const seen: Array<AbortSignal | undefined> = [];
    const controller = new AbortController();
    await preflightGeometry(rendition('ren_ok', 1_000), async (r, signal) => {
      seen.push(signal);
      return { bytes: r.bytes };
    }, { signal: controller.signal });
    expect(seen[0]).toBe(controller.signal);
  });
});

describe('guardManifest', () => {
  function manifest(lod0Bytes: number, lod2Bytes: number): AssetManifest {
    return {
      assetId: 'ast_01',
      listingId: 'lst_01',
      version: 3,
      checksum: 'sha256:dev',
      claimScope: 'geometry_and_external_condition',
      metricScaleMetersPerUnit: 0.0405,
      poster: rendition('ren_poster', 118_000, 'POSTER', 'poster'),
      renditions: [rendition('ren_lod0', lod0Bytes, 'MODEL', 'lod0'), rendition('ren_lod2', lod2Bytes, 'MODEL', 'lod2')],
      captions: [],
    };
  }

  it('guards the rendition the device would actually have been sent, not the biggest one that exists', () => {
    // selectLod steps down to lod2 (320 KB) because lod0 is 4 MB, so what gets downloaded fits.
    const guarded = guardManifest(manifest(4 * MB, 320_000));
    expect(guarded.rendition.id).toBe('ren_lod2');
    expect(guarded.guard.allowed).toBe(true);
  });

  it('refuses when even the coarsest tier is over budget — down-LOD is not an unlimited escape hatch', () => {
    const guarded = guardManifest(manifest(4 * MB, 3 * MB));
    expect(guarded.rendition.id).toBe('ren_lod2');
    expect(guarded.guard.allowed).toBe(false);
    if (guarded.guard.allowed) throw new Error('expected refusal');
    expect(guarded.guard.reason).toBe('over-budget');
    expect(guarded.guard.bytes).toBe(3 * MB);
  });

  it('allows a manifest whose finest tier already fits', () => {
    const guarded = guardManifest(manifest(1_800_000, 320_000));
    expect(guarded.rendition.id).toBe('ren_lod0');
    expect(guarded.guard.allowed).toBe(true);
  });
});
