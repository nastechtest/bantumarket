import type { CheckoutLineItem } from '../api/checkout-transport.js';
import { MoneyText } from '@nastech/design-system';
import { raw } from '@nastech/design-tokens';

/**
 * The line items, verbatim from the server. Pilot rule (guards/single-item-checkout): one item,
 * one quantity — but this renders whatever rows the ledger issued, because a UI that filtered
 * lines to hide a bad wire would be hiding it from the dispute process too.
 */
export function LineItems({ items }: { items: readonly CheckoutLineItem[] }) {
  return (
    <ul
      data-testid="line-items"
      style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: raw.space.s2 }}
    >
      {items.map((item) => (
        <li
          key={`${item.listingId}:${item.quantity}`}
          data-testid="line-item"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: raw.space.s3,
            alignItems: 'baseline',
            fontFamily: raw.type.familyText,
            color: raw.color.ink900,
          }}
        >
          <span>
            {item.title}
            {item.quantity !== 1 ? <span aria-hidden="true"> ×{String(item.quantity)}</span> : null}
          </span>
          <MoneyText value={item.unitPrice} />
        </li>
      ))}
    </ul>
  );
}
