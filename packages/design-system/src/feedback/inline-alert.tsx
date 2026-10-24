import type { ReactNode } from 'react';
import { raw, tokens } from '@nastech/design-tokens';

export type AlertTone = 'info' | 'positive' | 'caution' | 'negative';

export interface InlineAlertProps {
  tone: AlertTone;
  title?: string;
  children: ReactNode;
  /**
   * Force the live-region role. Default: `negative` and `caution` are `alert` (they correct or
   * warn about something just done), `info` and `positive` are `status`. A form error rendered
   * with the polite default would be "announced" after whatever the reader was already saying —
   * i.e. missed.
   */
  role?: 'alert' | 'status';
}

const TONE_EDGE: Record<AlertTone, string> = {
  info: raw.color.ink300,
  positive: tokens.assurance.disclosed,
  caution: raw.color.signalCaution,
  negative: raw.color.signalNegative,
};

/**
 * The non-dismissable message attached to a place: field errors above the form, payout notices
 * above the table. Unlike the Disclosure (context that stays relevant after reading), an alert
 * is a state the user must be told about *now*, hence the live-region roles. It has no dismiss
 * control by design — an alert you can close without resolving is how errors get buried.
 */
export function InlineAlert({ tone, title, children, role }: InlineAlertProps) {
  const resolvedRole = role ?? (tone === 'negative' || tone === 'caution' ? 'alert' : 'status');
  return (
    <div
      className="ds-inline-alert"
      role={resolvedRole}
      data-tone={tone}
      style={{
        background: tokens.surface.raised,
        border: `1px solid ${raw.color.ink100}`,
        borderLeft: `${raw.space.s1} solid ${TONE_EDGE[tone]}`,
        borderRadius: raw.radius.sm,
        padding: raw.space.s3,
        fontFamily: raw.type.familyText,
        fontSize: '0.875rem',
        color: tokens.text.primary,
      }}
    >
      {title ? <strong style={{ display: 'block', marginBottom: raw.space.s1 }}>{title}</strong> : null}
      <div style={{ color: tokens.text.primary }}>{children}</div>
    </div>
  );
}
