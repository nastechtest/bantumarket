import type { Capability } from '@nastech/ui-3d/quality';
import type { AssetManifest, Rendition } from '@nastech/api-contracts';

export function makeCapability(overrides: Partial<Capability> = {}): Capability {
  return {
    gl: 'webgl2',
    maxTextureSize: 4096,
    deviceMemoryGb: 4,
    hardwareConcurrency: 8,
    effectiveConnection: '4g',
    saveData: false,
    prefersReducedMotion: false,
    coarsePointer: false,
    ...overrides,
  };
}

const MB = 1024 * 1024;

export function makeRendition(
  base: Pick<Rendition, 'id' | 'kind' | 'lod' | 'bytes' | 'sha256' | 'bucketKey' | 'mime'>,
  extra: Partial<Pick<Rendition, 'widthPx' | 'heightPx' | 'frames'>> = {},
): Rendition {
  return { ...base, ...extra };
}

export function makeModel(bytes: number, sha256 = 'hash-model'): Rendition {
  return makeRendition({
    id: 'r-model', kind: 'MODEL', lod: 'lod0', bytes, sha256,
    bucketKey: 'private/watch/model.glb', mime: 'model/gltf-binary',
  });
}

export function makePoster(): Rendition {
  return makeRendition(
    {
      id: 'r-poster', kind: 'POSTER', lod: 'poster', bytes: 90 * 1024,
      sha256: 'hash-poster', bucketKey: 'private/watch/poster.webp', mime: 'image/webp',
    },
    { widthPx: 1200, heightPx: 1200 },
  );
}

export function makeManifest(overrides: Partial<AssetManifest> = {}): AssetManifest {
  return {
    assetId: 'asset-1',
    listingId: 'listing-1',
    version: 3,
    checksum: 'manifest-checksum',
    claimScope: 'geometry_and_external_condition',
    metricScaleMetersPerUnit: 0.02,
    renditions: [
      makeModel(1.8 * MB, 'hash-lod0'),
      makeRendition({
        id: 'r-lod1', kind: 'MODEL', lod: 'lod1', bytes: 900 * 1024,
        sha256: 'hash-lod1', bucketKey: 'private/watch/l1.glb', mime: 'model/gltf-binary',
      }),
    ],
    poster: makePoster(),
    captions: [],
    ...overrides,
  };
}
