import { budgets } from '@nastech/api-contracts';

/**
 * Device capability probe (07 §4.1 `quality/`). Called once per page, result cached per session —
 * it is a synchronous GPU query on a phone and repeating it per component mount is how a page
 * jank budget disappears.
 */

export type GlSupport = 'webgl2' | 'webgl1' | 'none';

export interface Capability {
  readonly gl: GlSupport;
  readonly maxTextureSize: number;
  readonly deviceMemoryGb: number | null;
  readonly hardwareConcurrency: number;
  readonly effectiveConnection: 'slow-2g' | '2g' | '3g' | '4g' | 'unknown';
  readonly saveData: boolean;
  readonly prefersReducedMotion: boolean;
  readonly coarsePointer: boolean;
}

export const UNSUPPORTED: Capability = {
  gl: 'none',
  maxTextureSize: 0,
  deviceMemoryGb: null,
  hardwareConcurrency: 1,
  effectiveConnection: 'unknown',
  saveData: false,
  prefersReducedMotion: false,
  coarsePointer: true,
};

function probeGl(win: Window): { gl: GlSupport; maxTextureSize: number } {
  const canvas = win.document.createElement('canvas');
  const gl2 = canvas.getContext('webgl2');
  if (gl2) {
    const max = gl2.getParameter(gl2.MAX_TEXTURE_SIZE) as number;
    gl2.getExtension('WEBGL_lose_context')?.loseContext();
    return { gl: 'webgl2', maxTextureSize: Number.isFinite(max) ? max : 0 };
  }
  const gl1 = canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl');
  if (gl1) {
    const gl = gl1 as WebGLRenderingContext;
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { gl: 'webgl1', maxTextureSize: Number.isFinite(max) ? max : 0 };
  }
  return { gl: 'none', maxTextureSize: 0 };
}

export function probeCapability(win: Window = window): Capability {
  const { gl, maxTextureSize } = probeGl(win);
  const nav = win.navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; saveData?: boolean };
  };
  return {
    gl,
    maxTextureSize,
    deviceMemoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    hardwareConcurrency: nav.hardwareConcurrency ?? 1,
    effectiveConnection: (nav.connection?.effectiveType as Capability['effectiveConnection']) ?? 'unknown',
    saveData: nav.connection?.saveData === true,
    prefersReducedMotion: win.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    coarsePointer: win.matchMedia?.('(pointer: coarse)').matches === true,
  };
}

/**
 * The one gate that decides whether a GLB is fetched at all. Both the viewport and the probe have
 * to agree (07 §4.2) — a capable device on 2g with save-data on does not get a 2.5 MB download.
 */
export function canFetchScene(cap: Capability): boolean {
  if (cap.gl === 'none') return false;
  if (cap.saveData) return false;
  if (cap.effectiveConnection === 'slow-2g' || cap.effectiveConnection === '2g') return false;
  if (cap.deviceMemoryGb !== null && cap.deviceMemoryGb < 2) return false;
  if (cap.gl === 'webgl1' && cap.maxTextureSize < 2048) return false;
  return true;
}

/** DPR is capped here, not at the call site: a 3x Retina phone renders 2.25x the pixels for no visible gain. */
export function devicePixelRatioCap(cap: Capability): number {
  if (cap.deviceMemoryGb !== null && cap.deviceMemoryGb <= 3) return 1.5;
  if (cap.gl === 'webgl1') return 1.5;
  return 2;
}

/**
 * Fraction of `sceneTokens.maxPixelsPerSecondBudget` this device may spend on continuous repaint.
 *
 * GPU signals only — memory and GL version. Connection and save-data gate *bytes*, not fill rate,
 * and belong to `canFetchScene`; folding them in here would let a fast phone on 3g be told its
 * shader work is slow. Weakest signal wins, and `gl:'none'` is 0: no drag cadence is affordable on
 * a device with no context, which is why that path never fetches a scene at all.
 */
export function continuousRepaintBudgetScale(cap: Capability): number {
  if (cap.gl === 'none') return 0;
  let scale = 1;
  if (cap.gl === 'webgl1') scale = Math.min(scale, 0.4);
  if (cap.deviceMemoryGb !== null && cap.deviceMemoryGb <= 3) scale = Math.min(scale, 0.4);
  else if (cap.deviceMemoryGb !== null && cap.deviceMemoryGb <= 4) scale = Math.min(scale, 0.65);
  return scale;
}

export { budgets };
