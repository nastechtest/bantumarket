import { raw, tokens } from '@nastech/design-tokens';

export interface ProgressSpec {
  readonly value: number | null;
  readonly min?: number;
  readonly max?: number;
  /** Always required: a progressbar without an accessible name announces a number into the void. */
  readonly label: string;
  /** Human override for the announced value, e.g. "3 of 12 captures done". */
  readonly valueText?: string;
}

/**
 * Headless progressbar semantics. The two ways to get this wrong in the wild — omitting
 * `aria-valuenow` on a determinate bar, and leaving a stale `valuenow` on an indeterminate one —
 * are settled here: `value: null` means indeterminate and the ARIA value attributes are absent,
 * because "no idea how far along" must not read as "0% done".
 */
export function progressProps(spec: ProgressSpec): Record<string, string | number> {
  const min = spec.min ?? 0;
  const max = spec.max ?? 100;
  const clamped = spec.value === null ? null : Math.min(max, Math.max(min, spec.value));
  const props: Record<string, string | number> = {
    role: 'progressbar',
    'aria-valuemin': min,
    'aria-valuemax': max,
    'aria-label': spec.label,
  };
  if (clamped !== null) {
    props['aria-valuenow'] = clamped;
    props['aria-valuetext'] = spec.valueText ?? `${Math.round(percentOf(clamped, min, max))}%`;
  }
  return props;
}

export function percentOf(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100;
}

/** Percentage strings, never px — a bar is a fraction of its container, at every width. */
export function fillStyle(percent: number): { width: string; background: string } {
  const pct = Math.min(100, Math.max(0, percent));
  return { width: `${pct}%`, background: tokens.action.default };
}
