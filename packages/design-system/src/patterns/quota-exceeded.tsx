import { raw, tokens } from '@nastech/design-tokens';
import { InlineAlert } from '../feedback/inline-alert.js';

export interface QuotaExceededProps {
  /** What ran out, in the server's own words — the design system does not know quota names. */
  quotaName: string;
  used: number;
  limit: number;
  /** The next real step: "request more capture slots", not a shrug. */
  onRequestMore?: () => void;
  requestLabel?: string;
}

/**
 * The 429 surface, and the reason it is a pattern rather than a toast: quota walls stop a
 * workflow mid-flight (capture uploads, listing publishes), so the numbers must stay on screen
 * while the user decides. The bar is honest — a clamped fraction and exact integers, never a
 * rounded-down "98%". The reset window is the caller's sentence to pass through `children`;
 * inventing it here would be the design system making a claim the server did not make.
 */
export function QuotaExceeded({ quotaName, used, limit, onRequestMore, requestLabel = 'Request more' }: QuotaExceededProps) {
  const fraction = limit > 0 ? Math.min(used / limit, 1) : 1;
  const remaining = Math.max(limit - used, 0);
  return (
    <InlineAlert tone="caution" title={`“${quotaName}” quota exceeded`}>
      <div className="ds-quota-exceeded" style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s3 }}>
        <p style={{ margin: 0 }}>
          {used} of {limit} used — {remaining} remaining.
        </p>
        <div
          aria-hidden="true"
          style={{
            height: raw.space.s2,
            background: tokens.surface.primary,
            border: `1px solid ${raw.color.ink300}`,
            borderRadius: raw.radius.pill,
            overflow: 'hidden',
          }}
        >
          <div style={{ width: `${fraction * 100}%`, height: '100%', background: raw.color.signalCaution, borderRadius: raw.radius.pill }} />
        </div>
        <p style={{ margin: 0, fontSize: '0.8125rem', color: tokens.text.secondary }}>
          No reset time is shown because the server has not sent one — treat this limit as fixed
          until the request below is answered.
        </p>
        {onRequestMore ? (
          <button
            type="button"
            onClick={onRequestMore}
            style={{
              alignSelf: 'flex-start',
              background: tokens.action.default,
              color: tokens.text.onInverse,
              border: 'none',
              borderRadius: raw.radius.sm,
              padding: `${raw.space.s2} ${raw.space.s4}`,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            {requestLabel}
          </button>
        ) : null}
      </div>
    </InlineAlert>
  );
}
