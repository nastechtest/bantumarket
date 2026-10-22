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
