/**
 * `NO_3D=1` build stub (07 §11, gate D2).
 *
 * Same exports, same names, no scene runtime. Its existence is the proof that 3D is not
 * load-bearing: the app must build and every flow must complete against this file alone. If any
 * import here is missing, the fallback path has quietly become a dependency.
 */
import type { ReactNode } from 'react';
import { PosterFallback as RealPoster, TurntableSprite as RealSprite } from '../no3d/fallback-reexport.js';

export const CanvasHost = (_props: { children?: ReactNode; ariaLabel: string; dprCap: number }) => null;
/**
 * `SceneHost` and `LightingRig` are imported by `features/inspect/scene-mount.tsx`, which is reached
 * only through a dynamic `import()`. The NO_3D build still has to BUNDLE that module — the fallback
 * decision is made at runtime, not by dead-code elimination — so the two exports must exist here or
 * the artefact cannot be built. Both render nothing: under NO_3D there is no renderer to host and no
 * light to place, and the static path is what a buyer sees.
 */
export const SceneHost = (_props: Record<string, unknown>) => null;
export const LightingRig = () => null;
/**
 * The glTF loader is aliased here in NO_3D builds too: importing the real one would put three's
 * GLTFLoader in an artefact whose entire purpose is to contain no renderer. The URL helper stays
 * real because it is a string function and the static path still links to the asset.
 */
export const GltfAsset = (_props: Record<string, unknown>) => null;
export const resolveAssetUrl = (id: string, options: { base?: string } = {}) => {
  const base = (options.base ?? '/').replace(/\/+$/, '');
  return `${base}/assets/models/${id}.gltf`;
};
export const PosterFallback = RealPoster;
export const TurntableSprite = RealSprite;
export const probeCapability = () => UNSUPPORTED;
export const canFetchScene = () => false;
export const devicePixelRatioCap = () => 1;
export const UNSUPPORTED = {
  gl: 'none', maxTextureSize: 0, deviceMemoryGb: null, hardwareConcurrency: 1,
  effectiveConnection: 'unknown', saveData: false, prefersReducedMotion: false, coarsePointer: true,
} as const;
export const selectLod = () => { throw new Error('NO_3D build: no scene rendition may be selected.'); };
export const checkByteBudget = () => ({ ok: false, bytes: 0, limitBytes: 0 });
export const budgetVerdictFor = () => ({ ok: false, bytes: 0, limitBytes: 0 });
export const sceneTokens = { unitsPerMeter: 1, frameFill: 0, cameraFovDeg: 0, cameraNear: 0, cameraFar: 0, pivot: { x: 0, y: 0, z: 0 }, maxPixelsPerSecondBudget: 0 };
export const lightingTokens = {};
export const materialTokens = {};
