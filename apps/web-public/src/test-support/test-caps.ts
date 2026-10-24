import { budgets } from '@nastech/api-contracts';
import type { Capability } from '@nastech/ui-3d/quality';

/** A clean desktop baseline; override only the signals a given test is about. */
export function cap(overrides: Partial<Capability> = {}): Capability {
  return {
    gl: 'webgl2',
    maxTextureSize: 8192,
    deviceMemoryGb: 8,
    hardwareConcurrency: 8,
    effectiveConnection: '4g',
    saveData: false,
    prefersReducedMotion: false,
    coarsePointer: false,
    ...overrides,
  };
}

export const SCENE_LIMIT = budgets.sceneLodMaxBytes;
