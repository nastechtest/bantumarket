/**
 * Typed registry for the assets produced by `tooling/models/build-models.ts`.
 *
 * The bytes are authored constants on purpose: they are the same number the manifest records, and
 * the `generated-assets` test fails if this table drifts from a fresh generator run. A registry
 * that read the manifest at runtime would make the app depend on tooling output at import time —
 * and a byte-budget check that has to fetch its own budget is not a check.
 */

export const assetIds = ['wristwatch', 'smartphone', 'parka'] as const;

export type AssetId = (typeof assetIds)[number];

export interface GeneratedAssetEntry {
  readonly id: AssetId;
  readonly file: string;
  readonly bytes: number;
  readonly clip: string;
  readonly triangles: number;
  readonly materials: number;
  /** Mirrors `sceneTokens.unitsPerMeter`: the generator authors metres, so no scale is applied. */
  readonly unitsPerMeter: 1;
}

export const generatedAssets = {
  wristwatch: {
    id: 'wristwatch',
    file: 'wristwatch.gltf',
    bytes: 45_911,
    clip: 'inspect-turntable',
    triangles: 428,
    materials: 5,
    unitsPerMeter: 1,
  },
  smartphone: {
    id: 'smartphone',
    file: 'smartphone.gltf',
    bytes: 35_027,
    clip: 'inspect-turntable',
    triangles: 300,
    materials: 4,
    unitsPerMeter: 1,
  },
  parka: {
    id: 'parka',
    file: 'parka.gltf',
    bytes: 53_398,
    clip: 'inspect-turntable',
    triangles: 652,
    materials: 3,
    unitsPerMeter: 1,
  },
} as const satisfies Record<AssetId, GeneratedAssetEntry>;

export const generatedAssetList: readonly GeneratedAssetEntry[] = assetIds.map((id) => generatedAssets[id]);

export function isAssetId(value: string): value is AssetId {
  return (assetIds as readonly string[]).includes(value);
}

export function assetEntry(id: AssetId): GeneratedAssetEntry {
  const entry: GeneratedAssetEntry | undefined = generatedAssets[id];
  if (!entry) throw new TypeError(`unknown generated asset: ${String(id)}`);
  return entry;
}
