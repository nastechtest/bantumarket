import type { PaymentIntentResult } from '../api/checkout-transport.js';
import type { PaymentIntentState } from '../api/checkout-transport.js';

/**
 * One copy block per intent state, written to the ledger's actual semantics:
 * only `captured` + a booked `PAID` may say "paid"; `failed` alone may say
 * "nothing was charged" (a declined card never reaches the capture webhook);
 * `awaiting_provider`/`requires_redirect` may claim NOTHING about money yet.
 */
const STATE_COPY: Readonly<Record<PaymentIntentState, { title: string; body: string }>> = {
  requires_redirect: {
    title: 'Waiting for the bank’s page',
    body: 'The provider has opened a secure payment page. We show this order as paid only when their confirmation reaches the ledger.',
  },
  awaiting_provider: {
    title: 'With your bank for approval',
    body: 'Approve the payment in your banking app or on the bank’s secure page. This screen updates when the provider’s confirmation is booked — never before.',
  },
  captured: {
    title: 'Payment captured',
    body: 'The provider confirmed the capture. The ledger has booked it.',
  },
  failed: {
    title: 'Payment failed',
    body: 'The provider declined this payment. Nothing was charged, and the order is unchanged. You can try a different method or pay again.',
  },
  no_charge_required: {
    title: 'Reserved — pay the seller in cash at handover',
    body: 'No online payment is taken for this order. You hand cash to the seller at the meet-up, and only the handover confirmations move it forward.',
  },
};

export interface MethodStatusProps {
  readonly intent: PaymentIntentResult | null;
}

export function MethodStatus({ intent }: MethodStatusProps) {
  if (intent === null) {
    return <div data-testid="method-status" data-state="none" />;
  }
  const copy = STATE_COPY[intent.state];
  return (
    <div
      data-testid="method-status"
      data-state={intent.state}
      role="status"
      style={{
        border: '1px solid currentColor',
        borderRadius: '8px',
        padding: '12px',
        color: intent.state === 'failed' ? '#B42318' : '#1E2329',
      }}
    >
      <p style={{ margin: 0, fontWeight: 700 }}>{copy.title}</p>
      <p style={{ margin: '4px 0 0' }}>{copy.body}</p>
      {intent.providerReference !== null ? (
        <p style={{ margin: '4px 0 0', fontSize: '0.8125rem' }}>
          Provider reference: <code data-testid="provider-reference">{intent.providerReference}</code>
        </p>
      ) : null}
    </div>
  );
}
