import type { FeeRow, SellerCommissionRow } from '../api/checkout-transport.js';
import { MoneyText } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';

/**
 * Fee rows exactly as the server issued them.
 *
 * The two things this component must never do, by construction rather than by discipline:
 *   - add a row (a "convenience fee" the buyer never agreed to is the classic marketplace support
 *     ticket; the row set here is the wire's row set);
 *   - compute a row (the amount is a `Money` from `@nastech/api-contracts` and goes straight into
 *     `MoneyText`; if `CommissionPolicy`'s floor/cap ever bites, the booked number already reflects
 *     it and this screen shows that booked number).
 *
 * Empty input renders NOTHING — a fee section that invents a zero-row to look complete is noise
 * and `fees.test.tsx` pins that.
 */
export function FeeRows({ rows }: { rows: readonly FeeRow[] }) {
  if (rows.length === 0) {
    return <div data-testid="fee-rows-empty" />;
  }
  return (
    <ul data-testid="fee-rows" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: raw.space.s1 }}>
      {rows.map((row) => (
        <li
          key={row.id}
          data-testid="fee-row"
          data-borne-by={row.borneBy}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: raw.space.s3,
            fontFamily: raw.type.familyText,
            color: tokens.text.secondary,
          }}
        >
          <span>
            {row.label}
            {row.includedInBuyerTotal ? null : <em style={{ marginLeft: raw.space.s1, fontSize: '0.75rem' }}>(not in your total)</em>}
          </span>
          <MoneyText value={row.amount} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The commission line — the seller's charge, shown to the buyer as a fact about the platform,
 * verbatim from the quote (rate label and amount are both server strings). The note text states
 * the ledger's promise from `SettleRefund`: reversed in full on refund settlement.
 */
export function CommissionRow({ commission }: { commission: SellerCommissionRow | null }) {
  if (commission === null) return <div data-testid="commission-row-empty" />;
  return (
    <div
      data-testid="commission-row"
      style={{
        border: `1px solid ${raw.color.ink300}`,
        borderRadius: raw.radius.sm,
        padding: raw.space.s3,
        fontFamily: raw.type.familyText,
        color: tokens.text.secondary,
        fontSize: '0.875rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: raw.space.s3 }}>
        <span>Platform commission ({commission.rateLabel})</span>
        <MoneyText value={commission.amount} />
      </div>
      <p style={{ margin: `${raw.space.s1} 0 0` }}>{commission.note}</p>
    </div>
  );
}
