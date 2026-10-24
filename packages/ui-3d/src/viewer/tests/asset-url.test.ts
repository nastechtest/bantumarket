import { describe, expect, test } from 'bun:test';
import { ASSET_MODEL_DIR, assetBaseUrl, normalizeBase, resolveAssetFile, resolveAssetUrl } from '../../assets/asset-url.js';
import { assetIds, generatedAssets } from '../../assets/registry.js';

function metaWith(baseUrl: unknown): ImportMeta {
  return { env: { BASE_URL: baseUrl } } as unknown as ImportMeta;
}

describe('asset-url', () => {
  test('base "" resolves to the origin root', () => {
    expect(resolveAssetUrl('wristwatch', { base: '' })).toBe('/assets/models/wristwatch.gltf');
    expect(resolveAssetUrl('smartphone', { base: '' })).toBe('/assets/models/smartphone.gltf');
  });

  test('base "/staff/" resolves under the deployment prefix', () => {
    expect(resolveAssetUrl('wristwatch', { base: '/staff/' })).toBe('/staff/assets/models/wristwatch.gltf');
    expect(resolveAssetUrl('parka', { base: '/staff' })).toBe('/staff/assets/models/parka.gltf');
    expect(resolveAssetUrl('parka', { base: '/seller/' })).toBe('/seller/assets/models/parka.gltf');
  });

  test('every generated id lands in one directory', () => {
    for (const id of assetIds) {
      expect(resolveAssetUrl(id, { base: '' })).toBe(`/${ASSET_MODEL_DIR}/${generatedAssets[id].file}`);
    }
  });

  test('normalises whitespace, missing and trailing slashes without inventing a prefix', () => {
    expect(normalizeBase(undefined)).toBe('');
    expect(normalizeBase(null)).toBe('');
    expect(normalizeBase('')).toBe('');
    expect(normalizeBase('   ')).toBe('');
    expect(normalizeBase('/')).toBe('');
    expect(normalizeBase('.')).toBe('');
    expect(normalizeBase('staff')).toBe('/staff');
    expect(normalizeBase('/staff///')).toBe('/staff');
    expect(normalizeBase('https://cdn.test/staff/')).toBe('https://cdn.test/staff');
    expect(normalizeBase('//cdn.test/staff/')).toBe('//cdn.test/staff');
  });

  test('reads BASE_URL safely and falls back to root when import.meta.env is absent', () => {
    expect(assetBaseUrl(metaWith('/staff/'))).toBe('/staff');
    expect(assetBaseUrl(metaWith(''))).toBe('');
    expect(assetBaseUrl(metaWith(undefined))).toBe('');
    expect(assetBaseUrl(metaWith(42))).toBe('');
    expect(assetBaseUrl({} as ImportMeta)).toBe('');
    expect(resolveAssetUrl('wristwatch', { meta: metaWith('/seller/') })).toBe('/seller/assets/models/wristwatch.gltf');
  });

  test('resolveAssetFile never doubles the slash and keeps absolute bases', () => {
    expect(resolveAssetFile('/models/x.gltf', { base: '' })).toBe('/models/x.gltf');
    expect(resolveAssetFile('models/x.gltf', { base: '/staff/' })).toBe('/staff/models/x.gltf');
    expect(resolveAssetFile('models/x.gltf', { base: '//cdn.test/app/' })).toBe('//cdn.test/app/models/x.gltf');
  });
});
