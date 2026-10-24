/**
 * The palette and the scales, pinned.
 *
 * These are the constants every surface and the accessibility engine read, and until now they had no
 * test at all — a `design-tokens` change was only caught if something downstream happened to notice.
 * The assertions are the properties the rest of the system relies on, not a snapshot of the file.
 */

import { describe, expect, it } from 'bun:test';
import { raw, tokens } from '../src/index.js';

describe('raw colours', () => {
  it('are six-digit hex, so the palette can be inverted back to names', () => {
    for (const [name, value] of Object.entries(raw.color)) {
      // `tokenName` in a11y reports builds its hex→name map from these values, and prints the token
      // name in a contrast finding. A three-digit or named colour would drop out of that map silently.
      expect(`${name}=${value}`).toMatch(/^[A-Za-z0-9]+=#[0-9A-F]{6}$/);
    }
  });

  it('has no two tokens sharing a hex, because a finding can only name one of them', () => {
    const seen = new Map<string, string>();
    for (const [name, value] of Object.entries(raw.color)) {
      const clash = seen.get(value);
      expect(clash).toBeUndefined();
      seen.set(value, name);
    }
    expect(seen.size).toBe(Object.keys(raw.color).length);
  });
});

describe('semantic tokens', () => {
  it('point at raw values rather than inventing colours', () => {
    expect(tokens.surface.primary).toBe(raw.color.paper);
    expect(tokens.surface.raised).toBe(raw.color.paperWarm);
    expect(tokens.surface.inverse).toBe(raw.color.ink900);
    expect(tokens.text.primary).toBe(raw.color.ink900);
    expect(tokens.text.secondary).toBe(raw.color.ink500);
    expect(tokens.action.default).toBe(raw.color.accent600);
  });

  it('states the disabled-text exemption where it is taken', () => {
    // ink300 is 3.75:1 on paper: legal only because WCAG exempts inactive controls. Naming the same
    // token here means a future palette change cannot quietly move disabled text onto body copy.
    expect(tokens.text.disabled).toBe(raw.color.ink300);
    expect(tokens.text.disabled).not.toBe(tokens.text.secondary);
  });

  it('gives every assurance state a colour, so §13.2 has something to forbid by identity', () => {
    for (const value of Object.values(tokens.assurance)) {
      expect(value).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(new Set(Object.values(tokens.assurance)).size).toBe(3);
  });
});

describe('scales', () => {
  it('keeps spacing on a 4px rhythm and strictly increasing', () => {
    const values = Object.values(raw.space).map((value) => Number.parseInt(value, 10));
    expect(values).toEqual([...values].sort((a, b) => a - b));
    for (const value of values) expect(value % 4).toBe(0);
    expect(new Set(values).size).toBe(values.length);
  });

  it('keeps radius ordered, with pill large enough to be a pill', () => {
    const px = (value: string): number => Number.parseInt(value, 10);
    expect(px(raw.radius.sm)).toBeLessThan(px(raw.radius.md));
    expect(px(raw.radius.md)).toBeLessThan(px(raw.radius.lg));
    expect(px(raw.radius.pill)).toBeGreaterThanOrEqual(999);
  });

  it('ends every font stack in the generic family it needs', () => {
    expect(raw.type.familyDisplay.trim().endsWith('serif')).toBe(true);
    expect(raw.type.familyText.trim().endsWith('sans-serif')).toBe(true);
    expect(raw.type.familyMono.trim().endsWith('monospace')).toBe(true);
    const families = [raw.type.familyDisplay, raw.type.familyText, raw.type.familyMono];
    expect(new Set(families).size).toBe(3);
  });

  it('draws layout from the spacing scale instead of one-off numbers', () => {
    expect(tokens.layout.gutter).toBe(raw.space.s4);
    expect(tokens.layout.stack).toBe(raw.space.s5);
    expect(Number.parseInt(tokens.layout.contentMax, 10)).toBeGreaterThan(1000);
  });
});
