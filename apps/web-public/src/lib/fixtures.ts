import type { AssetManifest, ListingSummary } from '@nastech/api-contracts';
import { money } from '@nastech/api-contracts';

/** Dev fixtures only. Real data comes from the media endpoint; nothing here ships to a buyer. */
export const fixtureListings: ListingSummary[] = [
  { id: 'lst_01', title: 'Seiko “Presage” automatic, 40.5 mm', price: money(420_000), categorySlug: 'pre-owned-watches', sellerTier: 'T4', has3d: true, posterUrl: '/fixtures/presage-poster.jpg' },
  { id: 'lst_02', title: 'Casio F-91W, boxed', price: money(45_000), categorySlug: 'pre-owned-watches', sellerTier: 'T2', has3d: false, posterUrl: '/fixtures/f91w-poster.jpg' },
  { id: 'lst_03', title: 'Citizen Eco-Drive titanium', price: money(310_000), categorySlug: 'pre-owned-watches', sellerTier: 'T3', has3d: true, posterUrl: '/fixtures/eco-poster.jpg' },
];

export const fixtureManifest: AssetManifest = {
  assetId: 'ast_01', listingId: 'lst_01', version: 3,
  checksum: 'sha256:8c0e…dev',
  claimScope: 'geometry_and_external_condition',
  metricScaleMetersPerUnit: 0.0405,
  poster: { id: 'ren_poster', kind: 'POSTER', lod: 'poster', bytes: 118_000, sha256: 'dev', bucketKey: 'private', mime: 'image/jpeg', widthPx: 1200, heightPx: 1200, signedUrl: '/fixtures/presage-poster.jpg' } as never,
  sprite: { id: 'ren_sprite', kind: 'SPRITE', lod: 'poster', bytes: 340_000, sha256: 'dev', bucketKey: 'private', mime: 'image/jpeg', frames: 12, signedUrl: '/fixtures/presage-turntable-strip.jpg' } as never,
  renditions: [
    { id: 'ren_lod0', kind: 'MODEL', lod: 'lod0', bytes: 2_100_000, sha256: 'dev', bucketKey: 'private', mime: 'model/gltf-binary', signedUrl: '/fixtures/lod0.glb' },
    { id: 'ren_lod1', kind: 'MODEL', lod: 'lod1', bytes: 900_000, sha256: 'dev', bucketKey: 'private', mime: 'model/gltf-binary', signedUrl: '/fixtures/lod1.glb' },
    { id: 'ren_lod2', kind: 'MODEL', lod: 'lod2', bytes: 320_000, sha256: 'dev', bucketKey: 'private', mime: 'model/gltf-binary', signedUrl: '/fixtures/lod2.glb' },
  ] as never,
  captions: [
    { hotspotId: 'hs_bezel', position: [0.019, 0.004, 0.0], disclosureText: 'One hairline at 2 o’clock on the bezel. Visible only under raking light.', severity: 'cosmetic', disclosureId: 'dis_01' },
    { hotspotId: 'hs_crystal', position: [0.0, 0.006, 0.0], disclosureText: 'Crystal replaced by the previous owner. Not original; no effect on timekeeping claimed by seller, not verified by us.', severity: 'unknown', disclosureId: 'dis_02' },
  ],
};
