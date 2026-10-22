import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { raw } from '@nastech/design-tokens';
import { materialTokens } from '../scene-tokens.js';
import {
  MATERIAL_KINDS,
  isMaterialKind,
  materialPresets,
  physicalMaterialProps,
  resolvePresetColor,
  samplerTokensFor,
  type MaterialPreset,
} from '../material-presets.js';

/** The preset fields that must come straight out of the token table, field for field. */
const TOKEN_FIELDS = [
  'roughness',
  'metalness',
  'clearcoat',
  'clearcoatRoughness',
  'transmission',
  'thicknessMeters',
  'ior',
  'highlightAnisotropy',
  'sheen',
  'sheenRoughness',
] as const;

const PALETTE_VALUES = new Set<string>(Object.values(raw.color));

function everyNumberIn(obj: unknown, out: number[] = []): number[] {
  if (typeof obj === 'number') out.push(obj);
  else if (obj && typeof obj === 'object') for (const v of Object.values(obj)) everyNumberIn(v, out);
  return out;
}

/** The tree's ambient `bun:test` shim types the matchers the suite uses; a plain predicate keeps
 *  these assertions honest without depending on the ones it omits. */
function matches(value: string, pattern: RegExp): boolean {
  return pattern.test(value);
}

describe('material presets: composition from tokens', () => {
  it('covers the six pilot materials and nothing else', () => {
    expect(MATERIAL_KINDS).toEqual(['steel', 'gold', 'crystal', 'leather', 'rubber', 'ceramic']);
    expect(Object.keys(materialPresets).sort()).toEqual([...MATERIAL_KINDS].sort());
  });

  it('every numeric field of every preset is the token lookup for that material', () => {
    for (const kind of MATERIAL_KINDS) {
      const preset = materialPresets[kind];
      for (const field of TOKEN_FIELDS) {
        expect(preset[field]).toBe(materialTokens[field][kind]);
      }
      expect(preset.colorToken).toBe(materialTokens.baseColor[kind]);
    }
  });

  it('no preset carries a number that is not in the token table', () => {
    const tokenNumbers = new Set(everyNumberIn(materialTokens));
    for (const kind of MATERIAL_KINDS) {
      for (const value of everyNumberIn(materialPresets[kind])) {
        expect(tokenNumbers.has(value)).toBe(true);
      }
    }
  });

  it('no preset contains a literal colour string, in data or in source', () => {
    for (const kind of MATERIAL_KINDS) {
      for (const value of Object.values(materialPresets[kind])) {
        if (typeof value !== 'string') continue;
        expect(matches(value, /^#/)).toBe(false);
        // The only strings a preset may hold are the kind itself and a palette key.
        expect(value === kind || value in raw.color).toBe(true);
      }
    }
    const source = readFileSync(fileURLToPath(new URL('../material-presets.ts', import.meta.url)), 'utf8');
    expect(matches(source, /['"`]#[0-9a-fA-F]{3,8}['"`]/)).toBe(false);
  });

  it('the resolved colour is the palette value for the token name', () => {
    for (const kind of MATERIAL_KINDS) {
      const preset = materialPresets[kind];
      const hex = resolvePresetColor(preset);
      expect(PALETTE_VALUES.has(hex)).toBe(true);
      expect(hex).toBe(raw.color[preset.colorToken]);
    }
  });

  it('the palette key names a real primitive, so a typo fails at build time', () => {
    for (const kind of MATERIAL_KINDS) {
      expect(materialTokens.baseColor[kind] in raw.color).toBe(true);
    }
  });
});

describe('material presets: what the pilot category is actually made of', () => {
  it('the crystal is the only transmissive material, and it is measured in metres', () => {
    expect(materialPresets.crystal.transmission).toBeGreaterThan(0);
    for (const kind of MATERIAL_KINDS) {
      if (kind === 'crystal') continue;
      expect(materialPresets[kind].transmission).toBe(0);
    }
    // 1.2 mm as metres, because the scene is metric and `thickness` is a scene-unit value.
    expect(materialPresets.crystal.thicknessMeters).toBeLessThan(0.01);
    expect(materialPresets.crystal.thicknessMeters).toBeGreaterThan(0);
  });

  it('metal is metal and hide is not', () => {
    expect(materialPresets.steel.metalness).toBeGreaterThan(0.9);
    expect(materialPresets.gold.metalness).toBe(1);
    expect(materialPresets.leather.metalness).toBe(0);
    expect(materialPresets.rubber.metalness).toBe(0);
    expect(materialPresets.crystal.metalness).toBe(0);
  });

  it('a rough material is rougher than a polished one — the ordering the rig depends on', () => {
    const order = ['crystal', 'ceramic', 'gold', 'steel', 'leather', 'rubber'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(materialPresets[order[i]!]!.roughness).toBeGreaterThanOrEqual(materialPresets[order[i - 1]!]!.roughness);
    }
  });

  it('the crystal is corundum, not glass', () => {
    expect(materialPresets.crystal.ior).toBe(1.77);
    expect(materialPresets.crystal.roughness).toBeLessThan(materialPresets.ceramic.roughness);
  });

  it('brushed finishes are anisotropic and cast ones are not', () => {
    expect(materialPresets.steel.highlightAnisotropy).toBeGreaterThan(0);
    expect(materialPresets.crystal.highlightAnisotropy).toBe(0);
    expect(materialPresets.ceramic.highlightAnisotropy).toBe(0);
  });

  it('there is no condition variant in the table: one preset per material, ever', () => {
    // A "restored"/"polished" steel would let a render contradict the written condition report, and
    // a render is not evidence.
    expect(Object.keys(materialPresets)).toHaveLength(6);
    expect(isMaterialKind('polishedSteel')).toBe(false);
    expect(isMaterialKind('steel')).toBe(true);
  });
});

describe('material presets: consumption', () => {
  it('flattens to the property names a physical material takes, colour resolved', () => {
    const props = physicalMaterialProps(materialPresets.steel);
    expect(props.color).toBe(raw.color.ink100);
    expect(props.roughness).toBe(materialTokens.roughness.steel);
    expect(props.thickness).toBe(materialPresets.steel.thicknessMeters);
    expect(props.anisotropy).toBe(materialPresets.steel.highlightAnisotropy);
    expect(Object.keys(props).sort()).toEqual(
      [
        'anisotropy',
        'clearcoat',
        'clearcoatRoughness',
        'color',
        'ior',
        'metalness',
        'roughness',
        'sheen',
        'sheenRoughness',
        'thickness',
        'transmission',
      ].sort(),
    );
  });

  it('the presets are plain data — no class instances, nothing to construct per scene', () => {
    for (const kind of MATERIAL_KINDS) {
      const preset: MaterialPreset = materialPresets[kind];
      expect(Object.getPrototypeOf(preset)).toBe(Object.prototype);
      expect(JSON.parse(JSON.stringify(preset))).toEqual(preset);
    }
  });

  it('sampler anisotropy is clamped to the token ceiling and to what the device offers', () => {
    expect(samplerTokensFor({ maxAnisotropy: 16 }).anisotropy).toBe(materialTokens.anisotropyMax);
    expect(samplerTokensFor({ maxAnisotropy: 2 }).anisotropy).toBe(2);
    expect(samplerTokensFor({ maxAnisotropy: 0 }).anisotropy).toBe(1);
  });
});
