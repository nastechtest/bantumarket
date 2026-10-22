import { describe, expect, test } from 'bun:test';
import { raw } from '@nastech/design-tokens';
import { SEVERITY_ORDER, markerCss, severityStyles } from './severity-styles.js';

describe('severity styles', () => {
  test('unknown never borrows cosmetic look: colour, marker shape and label all differ', () => {
    expect(severityStyles.unknown.hex).not.toBe(severityStyles.cosmetic.hex);
    expect(severityStyles.unknown.marker).not.toBe(severityStyles.cosmetic.marker);
    expect(severityStyles.unknown.label).not.toBe(severityStyles.cosmetic.label);
  });

  test('every colour is a design token, not a local literal (token identity)', () => {
    const tokenValues = new Set<string>(Object.values(raw.color));
    for (const severity of SEVERITY_ORDER) {
      const style = severityStyles[severity];
      expect(tokenValues.has(style.hex)).toBe(true);
      const parts = style.colorToken.split('.');
      expect(parts[0]).toBe('raw');
      const resolved: string = raw[parts[1] as 'color'][parts[2] as keyof (typeof raw)['color']];
      expect(resolved).toBe(style.hex);
    }
  });

  test('cosmetic is the soft dot and unknown is the hard ring in CSS too', () => {
    expect(markerCss('cosmetic').background).toBe(raw.color.ink300);
    expect(markerCss('cosmetic').border).toBeUndefined();
    const ring = markerCss('unknown');
    expect(ring.border).toContain(severityStyles.unknown.hex);
    expect(ring.background).toBe('transparent');
  });

  test('functional is distinguishable from both of the others', () => {
    expect(severityStyles.functional.hex).not.toBe(severityStyles.cosmetic.hex);
    expect(severityStyles.functional.hex).not.toBe(severityStyles.unknown.hex);
  });
});
