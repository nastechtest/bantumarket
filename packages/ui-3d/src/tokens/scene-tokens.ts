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
  /**
   * Ceiling on *device pixels repainted per second* while a buyer drags — canvas area x dpr^2 x fps,
   * the one number that folds canvas size, DPR and repaint rate together. It is read as a per-second
   * rate on purpose: a canvas at rest repaints almost never (frameloop="demand"), so size alone
   * measures nothing; continuous inspection is what can overheat a phone.
   *
   * Set for the capable end of the ladder: 2.6 M device pixels per frame x 60 fps.
   * `quality/continuousRepaintBudgetScale` shrinks it for weaker devices and this is the *prior*;
   * the frame-rate governor is the measurement that can overrule it.
   *
   * UNMEASURED. Gate D1 (low-end Android) must replace this number with a measured one; until then
   * treat the tiers it produces as a sizing guard, not as proof a device can hold 60 fps.
   */
  maxPixelsPerSecondBudget: 156_000_000,
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

/** The six materials the pilot category is built from. A watch is a case, a crystal, a dial and a
 *  bracelet; nothing in the launch catalogue needs more. */
export type MaterialKind = 'steel' | 'gold' | 'crystal' | 'leather' | 'rubber' | 'ceramic';

/** A key of the primitive palette, never a hex literal. A material takes its colour by token name so
 *  the scene can be re-skinned by editing a token instead of six components. */
export type SceneColorToken = keyof typeof raw.color;

export const materialTokens = {
  /** Physical materials only. Standard materials do not respond to the studio rig and the result
   *  is a flat toy that undercutsthe condition claim the render exists to support. */
  roughness: { steel: 0.28, gold: 0.22, crystal: 0.04, leather: 0.72, rubber: 0.85, ceramic: 0.12 },
  metalness: { steel: 0.94, gold: 1.0, crystal: 0.0, leather: 0.0, rubber: 0.0, ceramic: 0.02 },
  clearcoat: { steel: 0.3, gold: 0.24, crystal: 0.85, leather: 0.0, rubber: 0.0, ceramic: 0.55, polishedCase: 0.42 },
  clearcoatRoughness: { steel: 0.14, gold: 0.1, crystal: 0.03, leather: 0.45, rubber: 0.55, ceramic: 0.06 },
  /** Dielectric transmission. Only the crystal is transparent; nothing else in the catalogue is. */
  transmission: { steel: 0.0, gold: 0.0, crystal: 0.65, leather: 0.0, rubber: 0.0, ceramic: 0.0 },
  /** Metres, because `sceneTokens.unitsPerMeter` is 1 and a transmission depth in the wrong unit
   *  turns a 1.2 mm crystal into a 1.2 m block of glass. */
  thicknessMeters: { steel: 0.0, gold: 0.0, crystal: 0.0012, leather: 0.0, rubber: 0.0, ceramic: 0.0016 },
  /** 1.77 is corundum, which is what a watch crystal actually is. */
  ior: { steel: 1.5, gold: 1.5, crystal: 1.77, leather: 1.5, rubber: 1.5, ceramic: 1.4 },
  /** Brushed steel and grained leather are anisotropic. Casting one round highlight over a brushed
   *  case quietly rewrites the finish the condition report describes. */
  highlightAnisotropy: { steel: 0.6, gold: 0.45, crystal: 0.0, leather: 0.25, rubber: 0.15, ceramic: 0.0 },
  sheen: { steel: 0.0, gold: 0.0, crystal: 0.0, leather: 0.35, rubber: 0.12, ceramic: 0.0 },
  sheenRoughness: { steel: 0.0, gold: 0.0, crystal: 0.0, leather: 0.6, rubber: 0.8, ceramic: 0.0 },
  /** There is no "polished" variant and there never will be: a preset whose job is to make a worn
   *  case look new contradicts the written disclosure, and a render is not evidence. */
  baseColor: { steel: 'ink100', gold: 'paperWarm', crystal: 'paper', leather: 'ink700', rubber: 'ink500', ceramic: 'paperWarm' },
  anisotropyMax: 4,
  toneMappingExposure: 1.05,
} as const satisfies {
  roughness: Record<MaterialKind, number>;
  metalness: Record<MaterialKind, number>;
  /** `polishedCase` predates the per-material table and a component already reads it; the extras key
   *  is the one a material kind cannot reach. */
  clearcoat: Record<MaterialKind, number> & { polishedCase: number };
  clearcoatRoughness: Record<MaterialKind, number>;
  transmission: Record<MaterialKind, number>;
  thicknessMeters: Record<MaterialKind, number>;
  ior: Record<MaterialKind, number>;
  highlightAnisotropy: Record<MaterialKind, number>;
  sheen: Record<MaterialKind, number>;
  sheenRoughness: Record<MaterialKind, number>;
  baseColor: Record<MaterialKind, SceneColorToken>;
  anisotropyMax: number;
  toneMappingExposure: number;
};
