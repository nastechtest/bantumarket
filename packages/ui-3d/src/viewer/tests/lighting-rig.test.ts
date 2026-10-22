import { describe, expect, test } from 'bun:test';
import { lightingTokens } from '@nastech/ui-3d/tokens';
import { lightRigSpec } from '../lighting-rig.js';

/**
 * The rig component itself can only render inside a Canvas (WebGL, real browser — see
 * canvas-render.browser.test.tsx). What jsdom CAN prove, and what the byte budget depends on, is
 * the pure token mapping: every light reads its numbers from lightingTokens and the HDR
 * environment map — the 3 MB asset the plan forbids — is provably absent from the rig.
 */
describe('lighting-rig spec', () => {
  test('the rig is key + fill + rim + a low bounce, all sourced from lightingTokens', () => {
    const rig = lightRigSpec();
    const directional = rig.filter((l) => l.type === 'directional');
    expect(directional).toHaveLength(3);
    expect(directional.map((l) => l.intensity)).toEqual([
      lightingTokens.keyIntensity,
      lightingTokens.fillIntensity,
      lightingTokens.rimIntensity,
    ]);
    expect(directional[0]?.position).toEqual([...lightingTokens.keyPosition]);
    expect(directional[1]?.color).toBe(lightingTokens.fillColor);
  });

  test('no light is an environment/HDR type and the token still says none', () => {
    const rig = lightRigSpec();
    for (const light of rig) {
      expect(['directional', 'ambient']).toContain(light.type);
    }
    expect(lightingTokens.envPreset).toBe('none');
  });

  test('the bounce ambient is a floor, not a flood: it must not outshine the fill', () => {
    const ambient = lightRigSpec().find((l) => l.type === 'ambient');
    expect(ambient).toBeDefined();
    expect(ambient?.intensity).toBeLessThan(lightingTokens.fillIntensity);
  });
});
