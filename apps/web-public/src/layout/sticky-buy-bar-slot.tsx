import { raw, tokens } from '@nastech/design-tokens';
import { TAP_TARGET_PX } from './breakpoints.js';
import { buyDisabledReason } from '../lib/online-status.js';

/**
 * The money affordance, pinned where the thumb already is.
 *
 * The offline behaviour is the whole reason this file exists separate from a generic bar: when
 * the connection is gone, the bar does NOT disappear (that would strand the buyer on the page
 * wondering where the button went) and does NOT queue anything (that would be a payment the
 * buyer believes is happening while the device cannot reach the ledger). It becomes the same
 * button, visibly disabled, with a plain-language reason wired to it via aria-describedby —
 * the reason is markup, not a toast, so a screen reader and a screenshot both get it.
 *
 * `online` is a required prop: the bar's honesty depends on the caller's store, and a default
 * of `true` is exactly how "silently queued" bugs are born.
 */
export function StickyBuyBarSlot({
  online,
  priceLabel,
  label,
  onBuy,
}: {
  readonly online: boolean;
  readonly priceLabel: string;
  readonly label: string;
  readonly onBuy?: () => void;
}) {
  const reason = buyDisabledReason(online);
  return (
    <div
      className="nt-sticky-buy"
      style={{
        background: tokens.surface.primary,
        borderTop: `1px solid ${raw.color.ink100}`,
        padding: `${raw.space.s3} ${raw.space.s4}`,
        display: 'flex',
        gap: raw.space.s4,
        alignItems: 'center',
        flexWrap: 'wrap',
        fontFamily: raw.type.familyText,
      }}
    >
      <span className="price nt-num" style={{ fontWeight: 600, color: tokens.text.primary }}>
        {priceLabel}
      </span>
      <span style={{ flex: 1 }} />
      {online ? (
        <button type="button" data-testid="buy-button" onClick={onBuy} style={buttonStyle(tokens.action.default, tokens.text.onInverse)}>
          {label}
        </button>
      ) : (
        <button
          type="button"
          data-testid="buy-button"
          disabled
          aria-disabled="true"
          aria-describedby="nt-buybar-offline-reason"
          style={{ ...buttonStyle(tokens.surface.raised, tokens.text.disabled), cursor: 'not-allowed' }}
        >
          {label}
        </button>
      )}
      {reason === null ? null : (
        <p id="nt-buybar-offline-reason" className="nt-fine" role="note" style={{ width: '100%', margin: 0, color: tokens.text.primary }}>
          {reason}
        </p>
      )}
    </div>
  );
}

function buttonStyle(background: string, color: string) {
  return {
    background,
    color,
    border: `1px solid ${raw.color.ink100}`,
    borderRadius: 'var(--nt-radius-pill)',
    padding: `${raw.space.s3} ${raw.space.s5}`,
    minHeight: TAP_TARGET_PX,
    fontFamily: raw.type.familyText,
    cursor: 'pointer',
    boxSizing: 'border-box' as const,
  };
}
