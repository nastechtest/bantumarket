import type { Money } from '@nastech/api-contracts';
import { raw } from '@nastech/design-tokens';
import { formatZar, formatZarRefunded } from './format.js';

/**
 * The only sanctioned way to put money on screen in this app. A call site that divides cents by
 * 100 and calls `toFixed(2)` reintroduces the rand/cents mixing the ledger's whole argument is
 * built against; routing through `Money` keeps that impossible by construction.
 */
export function MoneyText({
  value,
  refunded = false,
}: {
  value: Money;
  refunded?: boolean;
}) {
  return (
    <span
      className="ds-money"
      style={{
        fontVariantNumeric: 'tabular-nums',
        fontFamily: raw.type.familyText,
        fontFeatureSettings: '"tnum"',
      }}
    >
      {refunded ? formatZarRefunded(value) : formatZar(value)}
    </span>
  );
}
