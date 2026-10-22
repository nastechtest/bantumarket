import { describe, expect, test } from 'bun:test';
import { planScene } from '../scene-host.js';
import { makeCapability, makeManifest, makeModel, makeRendition, makePoster } from './fixtures.js';

describe('scene-host plan (pure entry decision, no DOM, no GL)', () => {
  test('a capable device with a fitting rendition gets the scene and the finest LOD', () => {
    const plan = planScene({ manifest: makeManifest(), capability: makeCapability() });
    expect(plan.mode).toBe('scene');
    expect(plan.reason).toBe('ok');
    expect(plan.lod?.tier).toBe('lod0');
    expect(plan.budget?.ok).toBe(true);
  });

  test('no WebGL means the static path, chosen BEFORE any byte is fetched', () => {
    const plan = planScene({ manifest: makeManifest(), capability: makeCapability({ gl: 'none', maxTextureSize: 0 }) });
    expect(plan.mode).toBe('static');
    expect(plan.reason).toBe('capability');
    expect(plan.lod).toBeNull();
  });

  test('save-data is a capability refusal, not a suggestion', () => {
    const plan = planScene({ manifest: makeManifest(), capability: makeCapability({ saveData: true }) });
    expect(plan.mode).toBe('static');
    expect(plan.reason).toBe('capability');
  });

  test('a rendition over the byte budget is refused with the over-budget verdict retained', () => {
    const manifest = makeManifest({ renditions: [makeModel(3 * 1024 * 1024, 'huge')] });
    const plan = planScene({ manifest, capability: makeCapability() });
    expect(plan.mode).toBe('static');
    expect(plan.reason).toBe('over-budget');
    expect(plan.budget?.ok).toBe(false);
    if (plan.budget?.ok === false) expect(plan.budget.limitBytes).toBeLessThan(3 * 1024 * 1024);
  });

  test('a manifest with no MODEL rendition falls back for the honest reason, not an error', () => {
    const manifest = makeManifest({ renditions: [], poster: makePoster() });
    const plan = planScene({ manifest, capability: makeCapability() });
    expect(plan.mode).toBe('static');
    expect(plan.reason).toBe('no-model-rendition');
  });

  test('lod1 is chosen when lod0 busts the per-call budget but lod1 fits', () => {
    const plan = planScene({
      manifest: makeManifest(),
      capability: makeCapability(),
      budgetBytes: 1024 * 1024, // lod0 is 1.8 MB, lod1 is 900 KB
    });
    expect(plan.mode).toBe('scene');
    expect(plan.lod?.tier).toBe('lod1');
  });

  test('reduced motion keeps the scene (buyers may still drag) but the render level is static', () => {
    const plan = planScene({
      manifest: makeManifest(),
      capability: makeCapability({ prefersReducedMotion: true }),
      canvasSize: { width: 30, height: 30 },
    });
    expect(plan.mode).toBe('scene');
    expect(plan.level).toBe('static');
  });

  test('canvas size drives the level: same device, a thumbnail is high and a wall-sized canvas is static', () => {
    const cap = makeCapability();
    const manifest = makeManifest();
    expect(planScene({ manifest, capability: cap, canvasSize: { width: 60, height: 60 } }).level).toBe('high');
    // 380² css — the actual inspection canvas — is high on this device. Under the old 2.6 Mpx/s
    // reading it was `static`, which is how every real scene got demoted.
    expect(planScene({ manifest, capability: cap, canvasSize: { width: 380, height: 380 } }).level).toBe('high');
    expect(planScene({ manifest, capability: cap, canvasSize: { width: 1200, height: 1200 } }).level).toBe('static');
  });

  test('the sprite-only manifest shape keeps its caption disclosures reachable via the poster', () => {
    const manifest = makeManifest({
      renditions: [
        makeRendition({ id: 'r-sprite', kind: 'SPRITE', lod: 'poster', bytes: 200_000, sha256: 'sp', bucketKey: 'k', mime: 'image/webp' }, { frames: 12 }),
        makeModel(500_000, 'm0'),
      ],
    });
    const plan = planScene({ manifest, capability: makeCapability() });
    // SPRITE is not a MODEL tier: selectLod must still find the 500 KB model, not the sprite.
    expect(plan.lod?.rendition.kind).toBe('MODEL');
    expect(plan.mode).toBe('scene');
  });
});
