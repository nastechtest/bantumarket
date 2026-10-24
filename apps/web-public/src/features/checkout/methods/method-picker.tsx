import { raw, tokens } from '@nastech/design-tokens';
import type { MethodDescriptor, PaymentMethodId } from '../api/checkout-transport.js';

/**
 * The picker is a radiogroup, not a row of buttons: "which method" is one exclusive choice and a
 * screen reader should be able to ask it that way. Methods come from the wire — if the server
 * stops offering one, it cannot appear here, and an order the server says is not cash-eligible
 * never shows a cash card with a confident little "why not?" for the buyer to email about.
 */
export interface MethodPickerProps {
  readonly methods: readonly MethodDescriptor[];
  readonly selected: PaymentMethodId | null;
  readonly onSelect: (id: PaymentMethodId) => void;
}

export function MethodPicker({ methods, selected, onSelect }: MethodPickerProps) {
  return (
    <div role="radiogroup" aria-label="Payment method" data-testid="method-picker" style={{ display: 'grid', gap: raw.space.s2 }}>
      {methods.map((method) => {
        const isSelected = method.id === selected;
        return (
          <label
            key={method.id}
            data-testid={`method-option-${method.id}`}
            data-selected={isSelected ? 'true' : 'false'}
            style={{
              display: 'flex',
              gap: raw.space.s3,
              alignItems: 'flex-start',
              border: `1px solid ${isSelected ? raw.color.ink900 : raw.color.ink300}`,
              borderRadius: raw.radius.md,
              padding: raw.space.s4,
              cursor: 'pointer',
              fontFamily: raw.type.familyText,
              color: tokens.text.primary,
              background: isSelected ? tokens.surface.raised : 'transparent',
            }}
          >
            <input
              type="radio"
              name="payment-method"
              value={method.id}
              checked={isSelected}
              onChange={() => onSelect(method.id)}
              style={{ marginTop: raw.space.s1 }}
            />
            <span>
              <strong>{method.label}</strong>
              <span style={{ display: 'block', color: tokens.text.secondary, fontSize: '0.875rem', marginTop: raw.space.s1 }}>
                {method.blurb}
                {method.chargeHappensOnProviderSurface ? ' Card and banking details are entered on your bank’s surface, never on NasTech.' : ''}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
