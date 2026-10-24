import { describe, expect, it } from 'bun:test';
import { budgets } from '@nastech/api-contracts';
import type { AssetManifest, Rendition } from '@nastech/api-contracts';
import { fixtureManifest } from '../../lib/fixtures.js';
import { formatMegabytes, gateBytes } from './byte-gate.js';

function withRenditions(renditions: readonly Rendition[]): AssetManifest {
  return { ...fixtureManifest, renditions };
}

describe('gateBytes — refuse before the fetch', () => {
  it('fetches the finest rendition that fits the ceiling (lod0 at 2.1 MB under 2.5 MB)', () => {
    const gate = gateBytes(fixtureManifest);
    expect(gate.fetch).toBe(true);
    if (gate.fetch) {
      expect(gate.lod.tier).toBe('lod0');
      expect(gate.bytes).toBe(2_100_000);
    }
  });

  it('refuses when every model rendition is over the ceiling, and names the limit', () => {
    const heavy: Rendition[] = [
      { id: 'a', kind: 'MODEL', lod: 'lod0', bytes: 4_000_000, sha256: 'a', bucketKey: 'k', mime: 'model/gltf-binary' },
      { id: 'b', kind: 'MODEL', lod: 'lod1', bytes: 3_200_000, sha256: 'b', bucketKey: 'k', mime: 'model/gltf-binary' },
    ];
    const gate = gateBytes(withRenditions(heavy));
    expect(gate.fetch).toBe(false);
    if (!gate.fetch) {
      expect(gate.limitBytes).toBe(budgets.sceneLodMaxBytes);
      // It still reports the lightest available so the readout can say what *would* be needed.
      expect(gate.lod.bytes).toBe(3_200_000);
    }
  });

  it('treats "no model published" as do-not-fetch, not as an over-budget case', () => {
    const gate = gateBytes(withRenditions([]));
    expect(gate.fetch).toBe(false);
    if (!gate.fetch) expect(gate.lod.reason).toBe('no-rendition');
  });

  it('honours a tighter ceiling and skips a rendition that fits under it', () => {
    // With a 1 MB ceiling, lod1 (900 KB) is the finest that fits — so this must fetch, not refuse.
    const gate = gateBytes(fixtureManifest, 1_000_000);
    expect(gate.fetch).toBe(true);
    if (gate.fetch) expect(gate.lod.tier).toBe('lod1');
  });
});

describe('formatMegabytes', () => {
  it('renders the unit a buyer reasons in', () => {
    expect(formatMegabytes(2_100_000)).toBe('2.00 MB');
    expect(formatMegabytes(0)).toBe('0.00 MB');
  });
});
