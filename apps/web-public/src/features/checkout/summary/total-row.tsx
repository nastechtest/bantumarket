import type { Money } from '@nastech/api-contracts';
import { MoneyText } from '@nastech/design-system';
import { raw } from '@nastech/design-tokens';
import { assertWholeCents, requireZar } from './currency.js';

/**
 * THE number. `order.buyerTotal` — the exact cents `CreateOrder` copied and `RecordProviderPayment`
 * will demand on capture (an amount mismatch quarantines the webhook as a discrepancy; the screen
 * and the ledger showing different totals is that bug wearing a UI).
 *
 * This row does no addition: it renders the `Money` it was handed. The addition-shaped check that
 * the parts agree with this whole lives in guards/price-integrity.ts and can only ever BLOCK the
 * screen, never rewrite it.
 */
export function TotalRow({ total, where = 'total' }: { total: Money; where?: string }) {
  const value = requireZar(total, where);
  assertWholeCents(value, where);
  return (
    <div
      data-testid="total-row"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: raw.space.s3,
        paddingTop: raw.space.s2,
        borderTop: `2px solid ${raw.color.ink900}`,
        fontFamily: raw.type.familyText,
        fontWeight: 700,
        color: raw.color.ink900,
      }}
    >
      <span>Total to pay</span>
      <MoneyText value={value} />
    </div>
  );
}
