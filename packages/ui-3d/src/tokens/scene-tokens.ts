import { raw } from '@nastech/design-tokens';

/**
 * Scene, lighting and material tokens (07 §4.1 `tokens/`).
 *
 * Units are metres. The metric alignment recorded at capture is what makes a 40 mm case look like
 * 40 mm on screen, and it is the only reason a size claim made next to a render means anything.
 */

export const sceneTokens = {
  unitsPerMeter: 1,
  /** Reference device target: an object sized to fill this fraction of the frame reads as "the item", not "a render". */
  frameFill: 0.72,
  cameraFovDeg: 32,
  cameraNear: 0.01,
  cameraFar: 5,
  pivot: { x: 0, y: 0.021, z: 0 },
  maxPixelsPerSecondBudget: 2_600_000,
} as const;

export const lightingTokens = {
  keyIntensity: 2.1,
  keyColor: raw.color.paper,
  keyPosition: [0.34, 0.52, 0.28] as const,
  fillIntensity: 0.55,
  fillColor: raw.color.accent300,
  rimIntensity: 1.3,
  /** Studio reference: softbox above, bounce card below. Not an HDR environment map — that is a
   * 3 MB asset and it is the single largest avoidable byte in a product render pipeline. */
  envPreset: 'none' as const,
  shadow: { enabled: true, blurRadius: 2.4, opacity: 0.18 } as const,
} as const;

export const materialTokens = {
  /** Physical materials only. Standard materials do not respond to the studio rig and the result
   *  is a flat toy that undercutsthe condition claim the render exists to support. */
  roughness: { steel: 0.28, crystal: 0.04, leather: 0.72, rubber: 0.85, ceramic: 0.12 },
  metalness: { steel: 0.94, gold: 1.0, ceramic: 0.02 },
  clearcoat: { crystal: 0.85, polishedCase: 0.42 },
  anisotropyMax: 4,
  toneMappingExposure: 1.05,
} as const;
