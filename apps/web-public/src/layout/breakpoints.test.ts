import { describe, it, expect } from 'bun:test';
import { tokens } from '@nastech/design-tokens';
import {
  breakpoints,
  BREAKPOINT_NAMES,
  COMPACT_QUERY,
  DESKTOP_QUERY,
  maxWidth,
  minWidth,
  px,
  TAP_TARGET_PX,
} from './breakpoints.js';

describe('breakpoint table', () => {
  it('is strictly ascending and floors at the 320px pilot device', () => {
    const values = BREAKPOINT_NAMES.map((n) => breakpoints[n]);
    expect(values[0]).toBe(320);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    }
  });

  it('xl is derived from the content-max token, not typed twice', () => {
    expect(breakpoints.xl).toBe(Number.parseInt(tokens.layout.contentMax, 10));
  });

  it('lg mirrors the controller stylesheet (880px) so header and hero break together', () => {
    expect(breakpoints.lg).toBe(880);
  });

  it('emits well-formed range queries; max-width is exclusive of the next step', () => {
    expect(minWidth('md')).toBe('(min-width: 740px)');
    expect(maxWidth('md')).toBe('(max-width: 739px)');
    expect(DESKTOP_QUERY).toBe(minWidth('md'));
    expect(COMPACT_QUERY).toBe(maxWidth('md'));
  });

  it('px() reads the token strings the same way TAP_TARGET_PX does', () => {
    expect(px('48px')).toBe(48);
    expect(px(tokens.layout.gutter)).toBe(16);
    expect(TAP_TARGET_PX).toBe(48);
  });
});
