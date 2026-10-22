import { raw } from '@nastech/design-tokens';
import { materialTokens } from './scene-tokens.js';
import type { MaterialKind, SceneColorToken } from './scene-tokens.js';

/**
 * Material presets (07 §4.1 `tokens/`) — `materialTokens` composed into whole, named materials.
 *
 * Plain data on purpose. The scene runtime is a lazy chunk that a first-paint route may never reach
 * (the fence in `scripts/check-3d-boundaries.ts` proves it), so the tokens directory must stay
 * importable from a page with no WebGL and no three in it. A preset is therefore not a
 * `<meshPhysicalMaterial>` and not a THREE object: it is a record both a JSX material and a
 * hand-written loader can read, and `resolvePresetColor` is the only place a hex string appears.
 *
 * Every number here is a token lookup, which is what the test enforces: a preset with a literal in
 * it is a value nobody can re-skin, and per-material colour drift is exactly how a catalogue ends up
 * with three different "steels".
 */

export type { MaterialKind } from './scene-tokens.js';

/** One property per MeshPhysicalMaterial the studio rig actually responds to; nothing speculative. */
export interface MaterialPreset {
  readonly kind: MaterialKind;
  /** A palette key, never a hex value. */
  readonly colorToken: SceneColorToken;
  readonly roughness: number;
  readonly metalness: number;
  readonly clearcoat: number;
  readonly clearcoatRoughness: number;
  readonly transmission: number;
  /** Metres, matching `sceneTokens.unitsPerMeter`. */
  readonly thicknessMeters: number;
  readonly ior: number;
  readonly highlightAnisotropy: number;
  readonly sheen: number;
  readonly sheenRoughness: number;
}

export const MATERIAL_KINDS: readonly MaterialKind[] = ['steel', 'gold', 'crystal', 'leather', 'rubber', 'ceramic'];

export function isMaterialKind(value: string): value is MaterialKind {
  return (MATERIAL_KINDS as readonly string[]).includes(value);
}

/** Presets are assembled from the token tables rather than written out, so a missing per-material
 *  token is a compile error instead of a watch that renders black. */
function presetFor(kind: MaterialKind): MaterialPreset {
  return {
    kind,
    colorToken: materialTokens.baseColor[kind],
    roughness: materialTokens.roughness[kind],
    metalness: materialTokens.metalness[kind],
    clearcoat: materialTokens.clearcoat[kind],
    clearcoatRoughness: materialTokens.clearcoatRoughness[kind],
    transmission: materialTokens.transmission[kind],
    thicknessMeters: materialTokens.thicknessMeters[kind],
    ior: materialTokens.ior[kind],
    highlightAnisotropy: materialTokens.highlightAnisotropy[kind],
    sheen: materialTokens.sheen[kind],
    sheenRoughness: materialTokens.sheenRoughness[kind],
  };
}

export const materialPresets: Readonly<Record<MaterialKind, MaterialPreset>> = {
  steel: presetFor('steel'),
  gold: presetFor('gold'),
  crystal: presetFor('crystal'),
  leather: presetFor('leather'),
  rubber: presetFor('rubber'),
  ceramic: presetFor('ceramic'),
};

/** The hex, resolved at the last moment from the primitive palette. Consumers that need a colour
 *  string take it from here; nothing in `tokens/` stores one. */
export function resolvePresetColor(preset: MaterialPreset): string {
  return raw.color[preset.colorToken];
}

/**
 * The preset flattened to the property names three uses, with the colour already resolved — the one
 * helper a scene component needs, and still zero imports from the scene runtime.
 */
export function physicalMaterialProps(preset: MaterialPreset): {
  readonly color: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly clearcoat: number;
  readonly clearcoatRoughness: number;
  readonly transmission: number;
  readonly thickness: number;
  readonly ior: number;
  readonly anisotropy: number;
  readonly sheen: number;
  readonly sheenRoughness: number;
} {
  return {
    color: resolvePresetColor(preset),
    roughness: preset.roughness,
    metalness: preset.metalness,
    clearcoat: preset.clearcoat,
    clearcoatRoughness: preset.clearcoatRoughness,
    transmission: preset.transmission,
    thickness: preset.thicknessMeters,
    ior: preset.ior,
    anisotropy: preset.highlightAnisotropy,
    sheen: preset.sheen,
    sheenRoughness: preset.sheenRoughness,
  };
}

/** Texture filtering, which is a renderer setting and not a material: shared by every preset so a
 *  mid-range device pays for one mip filter rather than six. */
export function samplerTokensFor(cap: { maxAnisotropy: number }): { readonly anisotropy: number } {
  return { anisotropy: Math.max(1, Math.min(materialTokens.anisotropyMax, Math.round(cap.maxAnisotropy) || 1)) };
}
