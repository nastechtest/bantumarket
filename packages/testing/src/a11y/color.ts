/**
 * The colour engine behind the contrast rule.
 *
 * Split from `checks.ts` because this is arithmetic, not DOM: parse a CSS colour, composite a
 * translucent one over a background, return a WCAG ratio. Nothing here reads an element, so the
 * numbers a report quotes can be tested without a page — which matters most for the two things people
 * mis-remember: the 0.03928 linearisation knee, and the +0.05 added to BOTH sides of the ratio.
 *
 * Colour in this product comes from tokens, so `tokenName` inverts the palette and a finding reads
 * `raw.color.ink300 on raw.color.paper` rather than a bare hex. An unrecognised colour still reports
 * its hex: saying "that is not a token" is more useful than pretending it is one.
 */
import { raw } from '@nastech/design-tokens';

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const NAMED: Readonly<Record<string, string>> = {
  white: '#FFFFFF',
  black: '#000000',
  red: '#FF0000',
  green: '#008000',
  blue: '#0000FF',
  transparent: 'rgba(0,0,0,0)',
};

/** Token hexes, inverted to names so a report says `ink300 on paper`, never a bare `#7B858F`. */
const TOKEN_NAMES: ReadonlyMap<string, string> = new Map(
  Object.entries(raw.color).map(([name, hex]) => [hex.toUpperCase() as string, `raw.color.${name}`]),
);

export function tokenName(color: Rgb): string | null {
  if (color.a !== 1) return null;
  const hex = `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`.toUpperCase();
  return TOKEN_NAMES.get(hex) ?? null;
}

function channel(value: number): string {
  return value.toString(16).padStart(2, '0');
}

export function parseColor(input: string | null | undefined): Rgb | null {
  if (input === null || input === undefined) return null;
  const trimmed = input.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'inherit' || trimmed === 'currentcolor') return null;
  const named = NAMED[trimmed];
  const source = named ?? trimmed;
  const hex = source.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex !== null) {
    const body = hex[1]!;
    const expanded = body.length === 3 ? body.split('').map((c) => c + c).join('') : body;
    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgb = source.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb !== null) {
    const parts = rgb[1]!
      .split(/[,/\s]+/)
      .map((part) => part.trim())
      .filter((part) => part !== '');
    if (parts.length < 3) return null;
    const numbers = parts.slice(0, 3).map((part) => (part.endsWith('%') ? (Number.parseFloat(part) / 100) * 255 : Number.parseFloat(part)));
    const alphaToken = parts[3] ?? '1';
    const alpha = alphaToken.endsWith('%') ? Number.parseFloat(alphaToken) / 100 : Number.parseFloat(alphaToken);
    if (numbers.some((n) => Number.isNaN(n))) return null;
    return { r: numbers[0]!, g: numbers[1]!, b: numbers[2]!, a: Number.isNaN(alpha) ? 1 : alpha };
  }
  return null;
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(color: Rgb): number {
  const channels = [color.r, color.g, color.b].map((value) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/** `srgb` over `under`, per WCAG: (L1 + 0.05) / (L2 + 0.05). */
export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const fg = composite(foreground, background);
  const bgL = relativeLuminance(fg.background);
  const fgL = relativeLuminance(fg.foreground);
  const lighter = Math.max(fgL, bgL);
  const darker = Math.min(fgL, bgL);
  return (lighter + 0.05) / (darker + 0.05);
}

function composite(foreground: Rgb, background: Rgb): { foreground: Rgb; background: Rgb } {
  if (foreground.a >= 1) return { foreground, background };
  const blend = (a: number, b: number) => a * foreground.a + b * (1 - foreground.a);
  return {
    foreground: { r: blend(foreground.r, background.r), g: blend(foreground.g, background.g), b: blend(foreground.b, background.b), a: 1 },
    background,
  };
}

export function hexOf(color: Rgb): string {
  return `#${channel(Math.round(color.r))}${channel(Math.round(color.g))}${channel(Math.round(color.b))}`.toUpperCase();
}
