/**
 * Design tokens — the single source of primitive values.
 *
 * Layer 1 (primitives, this file's `raw`) is never consumed by application code directly;
 * consumers take the semantic aliases in `tokens`. Three layers because a scene needs to say
 * "assurance surface", not "#0F62FE".
 */

export const raw = {
  color: {
    ink900: '#0B0D10',
    ink800: '#14171B',
    ink700: '#1E2329',
    ink500: '#3C444D',
    ink300: '#7B858F',
    ink100: '#D7DCE1',
    paper: '#FFFFFF',
    paperWarm: '#F7F5F2',
    accent900: '#0A2E5C',
    accent600: '#0F62FE',
    accent300: '#7FA8E0',
    signalPositive: '#0E7A4F',
    signalCaution: '#B05A00',
    signalNegative: '#A4161A',
  },
  space: { s1: '4px', s2: '8px', s3: '12px', s4: '16px', s5: '24px', s6: '32px', s7: '48px', s8: '64px' },
  radius: { sm: '4px', md: '8px', lg: '14px', pill: '999px' },
  type: {
    familyDisplay: '"Ivar Display", "Georgia", serif',
    familyText: '"Söhne", "Inter", system-ui, sans-serif',
    familyMono: '"JetBrains Mono", ui-monospace, monospace',
  },
} as const;

export const tokens = {
  surface: { primary: raw.color.paper, raised: raw.color.paperWarm, inverse: raw.color.ink900 },
  text: { primary: raw.color.ink900, secondary: raw.color.ink500, disabled: raw.color.ink300, onInverse: raw.color.paper },
  action: { default: raw.color.accent600, hover: raw.color.accent900 },
  /**
   * Reserved for spec §13.2's review-blocking rule: no glow, sweep or "verified" motion may be
   * attached to a trust state that no check produced. These names exist so the lint has something
   * to forbid by identity rather than by eye.
   */
  assurance: { disclosed: raw.color.signalPositive, pending: raw.color.ink300, refused: raw.color.signalNegative },
  layout: { gutter: raw.space.s4, contentMax: '1180px', stack: raw.space.s5 },
} as const;

export type Tokens = typeof tokens;
export type Primitive = typeof raw;
