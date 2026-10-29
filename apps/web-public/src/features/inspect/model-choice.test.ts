/**
 * The model choice, and the URL it resolves to under each deployment base.
 *
 * These two facts are what let the inspect page show a captured object instead of a placeholder, so
 * they are asserted rather than left to the wiring: an unknown asset id must NOT silently pick a model
 * (that would show the buyer the wrong object), and the URL must carry the mount prefix.
 */
import { describe, expect, it } from 'bun:test';
import { resolveAssetUrl } from '@nastech/ui-3d/assets';
import { modelForAsset } from './model-choice.js';

describe('modelForAsset', () => {
  it('recognises the three modelled categories', () => {
    expect(modelForAsset('ast_watch_01')).toBe('wristwatch');
    expect(modelForAsset('AST-TIMEPIECE-9')).toBe('wristwatch');
    expect(modelForAsset('ast_phone_4')).toBe('smartphone');
    expect(modelForAsset('ast_parka_winter')).toBe('parka');
  });

  it('refuses to guess: an unmatched id gets the procedural placeholder, not a wrong object', () => {
    expect(modelForAsset('ast_lamp_02')).toBeNull();
    expect(modelForAsset('')).toBeNull();
  });
});

describe('the model URL', () => {
  it('resolves under the app root and under a mount prefix', () => {
    expect(resolveAssetUrl('wristwatch', { base: '/' })).toBe('/assets/models/wristwatch.gltf');
    expect(resolveAssetUrl('wristwatch', { base: '/staff/' })).toBe('/staff/assets/models/wristwatch.gltf');
  });
});
