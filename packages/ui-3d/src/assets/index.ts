/**
 * Generated-asset surface. Import from `@nastech/ui-3d/assets` so the loader, registry and URL
 * helper ship as one path; the root package entry stays free of the GLTF runtime.
 */

export {
  assetEntry,
  assetIds,
  generatedAssetList,
  generatedAssets,
  isAssetId,
  type AssetId,
  type GeneratedAssetEntry,
} from './registry.js';

export { ASSET_MODEL_DIR, assetBaseUrl, normalizeBase, resolveAssetFile, resolveAssetUrl } from './asset-url.js';
export type { ResolveAssetUrlOptions } from './asset-url.js';

export {
  GltfAsset,
  disposeSceneGraph,
  loadGltfWithThree,
  prefersReducedMotion,
  releaseMixer,
} from './model-loader.js';
export type {
  GltfAssetProps,
  GltfAssetRenderInfo,
  GltfLoad,
  MixerActionLike,
  MixerFactory,
  MixerLike,
} from './model-loader.js';
