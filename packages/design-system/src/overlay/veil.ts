import { raw } from '@nastech/design-tokens';

/**
 * Alpha treatment for scrims and veils. Colour may only ever be a `raw.color` primitive; the
 * alpha is the sole free parameter, same as the committed `sheet.tsx` scrim. Writing an rgba
 * literal here (or anywhere) would be a second source of truth for a token colour — the
 * token-literals guard fails it.
 */
export function dim(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Dark enough to read the panel as the only live surface without erasing context entirely. */
export const SCRIM_INK = dim(raw.color.ink900, 0.55);
