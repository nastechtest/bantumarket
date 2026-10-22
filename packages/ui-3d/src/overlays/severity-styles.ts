import type { CSSProperties } from 'react';
import { raw } from '@nastech/design-tokens';
import type { ConditionCaption } from '@nastech/api-contracts';

/**
 * Severity → token styles (brief 03, module 9).
 *
 * The one rule that is review-blocking: `unknown` must not look like `cosmetic`. A replaced
 * crystal whose effect on timekeeping was never checked is the case where a soft grey dot
 * understates the problem and the buyer reads "minor scuff". So `unknown` differs from `cosmetic`
 * on three independent channels — colour, marker shape, and a mandatory text label — which also
 * keeps it honest for colour-blind buyers, where colour alone would be a single point of failure.
 *
 * Colours are token references only. Never a hex literal here: `raw.color` is the single source,
 * and a test asserts every style resolves to one of its values.
 */

export type Severity = ConditionCaption['severity'];

export interface SeverityStyle {
  /** Dotted path into `raw.color`, kept so a test can verify token identity, not just the value. */
  readonly colorToken: string;
  readonly hex: string;
  /** 'dot' = a finding on the item; 'ring' = a question about the record. */
  readonly marker: 'dot' | 'ring';
  /** Mandatory visible + spoken text. Severity is never colour-alone. */
  readonly label: string;
  readonly ariaHint: string;
}

export const SEVERITY_ORDER: readonly Severity[] = ['cosmetic', 'functional', 'unknown'];

export const severityStyles: Readonly<Record<Severity, SeverityStyle>> = {
  cosmetic: {
    colorToken: 'raw.color.ink300',
    hex: raw.color.ink300,
    marker: 'dot',
    label: 'Cosmetic',
    ariaHint: 'cosmetic only',
  },
  functional: {
    colorToken: 'raw.color.signalCaution',
    hex: raw.color.signalCaution,
    marker: 'dot',
    label: 'Affects function',
    ariaHint: 'the disclosure record reports a functional effect',
  },
  unknown: {
    colorToken: 'raw.color.signalNegative',
    hex: raw.color.signalNegative,
    marker: 'ring',
    label: 'Not checked',
    ariaHint: 'never checked against the disclosed question — treat as unresolved',
  },
};

export function markerCss(severity: Severity): CSSProperties {
  const style = severityStyles[severity];
  if (style.marker === 'ring') {
    return {
      display: 'inline-block',
      width: 12,
      height: 12,
      borderRadius: '50%',
      border: `3px solid ${style.hex}`,
      background: 'transparent',
      boxSizing: 'border-box',
    };
  }
  return {
    display: 'inline-block',
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: style.hex,
    boxSizing: 'border-box',
  };
}
