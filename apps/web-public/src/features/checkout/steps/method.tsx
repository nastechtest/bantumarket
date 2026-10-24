import { raw, tokens } from '@nastech/design-tokens';
import { Stepper } from '@nastech/design-system';
import type { CheckoutView, PaymentMethodId } from '../api/checkout-transport.js';
import { MethodPicker } from '../methods/method-picker.js';
import { CHECKOUT_STEPS } from './review.js';

export interface MethodStepProps {
  readonly view: CheckoutView;
  readonly selected: PaymentMethodId | null;
  readonly onSelect: (id: PaymentMethodId) => void;
  readonly onBack: () => void;
}

/** Step 2: pick a method. Choosing here moves NO money and creates NO intent — it just shows the confirm screen. */
export function MethodStep({ view, selected, onSelect, onBack }: MethodStepProps) {
  return (
    <section data-testid="step-method" aria-label="Choose a payment method" style={{ display: 'grid', gap: raw.space.s4 }}>
      <Stepper steps={CHECKOUT_STEPS} currentIndex={1} />
      <header>
        <h2 style={{ margin: 0, fontFamily: raw.type.familyText, color: raw.color.ink900 }}>Payment method</h2>
        <p style={{ margin: `${raw.space.s1} 0 0`, color: tokens.text.secondary, fontSize: '0.875rem' }}>
          Only the methods NasTech offers for this order are listed.
        </p>
      </header>
      <MethodPicker methods={view.methods} selected={selected} onSelect={onSelect} />
      <button
        type="button"
        data-testid="method-back"
        onClick={onBack}
        style={{
          justifySelf: 'start',
          padding: `${raw.space.s2} ${raw.space.s4}`,
          borderRadius: raw.radius.md,
          border: `1px solid ${raw.color.ink300}`,
          background: 'transparent',
          color: tokens.text.primary,
          fontFamily: raw.type.familyText,
          cursor: 'pointer',
        }}
      >
        Back to review
      </button>
    </section>
  );
}
