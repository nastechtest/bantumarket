import { describe, expect, it } from 'bun:test';
import { sceneTokens } from '@nastech/ui-3d/tokens';
import { fixtureManifest } from '../../lib/fixtures.js';
import { decideInspect, STATIC_REASON_TEXT } from './inspect-decision.js';
import { qualityTier } from './quality-tier.js';
import { cap } from '../../test-support/test-caps.js';

describe('decideInspect — every exit lands on the complete static path with one reason', () => {
  it('sends a capable device to the scene', () => {
    const plan = decideInspect(cap(), fixtureManifest);
    expect(plan.mode).toBe('scene');
    if (plan.mode === 'scene') expect(plan.gate.lod.tier).toBe('lod0');
  });

  it('reduced motion → static, even though the device is fully capable', () => {
    const plan = decideInspect(cap({ prefersReducedMotion: true }), fixtureManifest);
    expect(plan.mode === 'static' && plan.reason).toBe('reduced-motion');
  });

  it('saveData → static', () => {
    const plan = decideInspect(cap({ saveData: true }), fixtureManifest);
    expect(plan.mode === 'static' && plan.reason).toBe('save-data');
  });

  it('gl none → static', () => {
    const plan = decideInspect(cap({ gl: 'none' }), fixtureManifest);
    expect(plan.mode === 'static' && plan.reason).toBe('no-webgl');
  });

  it('a refused byte budget → static with reason over-budget', () => {
    // A manifest whose only model is heavier than the ceiling: capable device, but bytes refuse it.
    const manifest = { ...fixtureManifest, renditions: fixtureManifest.renditions.map((r) => ({ ...r, bytes: 4_000_000 })) };
    const plan = decideInspect(cap(), manifest);
    expect(plan.mode === 'static' && plan.reason).toBe('over-budget');
  });

  it('no model rendition → static with a non-apologetic reason', () => {
    const manifest = { ...fixtureManifest, renditions: [] };
    const plan = decideInspect(cap(), manifest);
    expect(plan.mode === 'static' && plan.reason).toBe('no-model-rendition');
  });

  it('each static reason maps to a single one-line sentence that is not empty', () => {
    for (const reason of ['reduced-motion', 'save-data', 'no-webgl', 'over-budget', 'no-model-rendition', 'connection'] as const) {
      expect(STATIC_REASON_TEXT[reason].length).toBeGreaterThan(20);
    }
  });
});

describe('qualityTier — driven by the capability object, never by the px/s token', () => {
  // KNOWN OPEN ISSUE guard: sceneTokens.maxPixelsPerSecondBudget, read literally, classifies an
  // ordinary 300x300@DPR2 canvas as `static`. The inspect tier must therefore come only from device
  // signals, so a full-power desktop is `full` regardless of canvas size (size is not even an input).
  it('a strong desktop is the full tier', () => {
    const t = qualityTier(cap());
    expect(t.tier).toBe('full');
    expect(t.dprCap).toBe(2);
    expect(t.textureSizePx).toBe(2048);
  });

  it('a 4 GB device drops to balanced', () => {
    expect(qualityTier(cap({ deviceMemoryGb: 4 })).tier).toBe('balanced');
  });

  it('save-data floors to lite', () => {
    expect(qualityTier(cap({ saveData: true })).tier).toBe('lite');
  });

  it('cannot consult maxPixelsPerSecondBudget: it takes no viewport, only the capability', () => {
    // The disputed px/s token only bites once a canvas size is folded in (`levelFor(cap, size)`).
    // `qualityTier` has arity 1, so no size — and therefore no px/s classification — can reach a
    // real inspection surface through this path. If someone adds a size parameter, this fails.
    expect(qualityTier.length).toBe(1);
    expect(sceneTokens.maxPixelsPerSecondBudget).toBeGreaterThan(0);
    expect(qualityTier(cap()).tier).toBe('full');
  });
});
