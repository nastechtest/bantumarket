import { MoneyText } from '@nastech/design-system';
import type { PayoutSnapshot } from './api/dashboard-transport.js';
import { LinkButton, Muted, Panel } from './ui.js';

/**
 * Two numbers, never one: money that is still being held for the buyer's protection, and money
 * that is payable on a date. Adding them into a single "balance" is the most common marketplace
 * support ticket. The payout screen owns the full breakdown; this is its dashboard echo.
 */
export function PendingPayout({ payout }: { payout: PayoutSnapshot }) {
  const isFailed = payout.status === 'failed';
  return (
    <Panel title="Money" actions={<a href="/payouts">Payouts</a>} id="pending-payout">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        <div>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-500)' }}>Held for buyers</span>
          <p style={{ margin: '4px 0 0', fontSize: '1.25rem' }}>
            <MoneyText value={payout.pending} />
          </p>
          <Muted>Released after the buyer confirms the handover.</Muted>
        </div>
        <div>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-500)' }}>Payable now</span>
          <p style={{ margin: '4px 0 0', fontSize: '1.25rem' }}>
            <MoneyText value={payout.payable} />
          </p>
          <Muted>{payout.nextPayoutDate ? `Next payout run: ${payout.nextPayoutDate}.` : 'No payout is scheduled yet.'}</Muted>
        </div>
      </div>

      {isFailed ? (
        <div role="alert" style={{ border: '1px solid var(--neg)', borderRadius: '8px', padding: '12px' }}>
          <strong>Your last payout was returned.</strong>
          <Muted>{payout.failedReason ?? 'The bank did not accept the transfer. Update your bank details and we will retry.'}</Muted>
          <div style={{ marginTop: '8px' }}>
            <LinkButton href="/payouts">Fix bank details</LinkButton>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
