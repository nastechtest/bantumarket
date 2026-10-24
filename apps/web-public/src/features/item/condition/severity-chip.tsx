/**
 * Severity chip — the same refusal discipline as `VerificationBadge`, applied to the contract's
 * severity vocabulary: an unknown value renders nothing and warns, because a chip that falls back
 * to a generic label has invented a claim nobody made. The vocabulary is ConditionCaption's
 * (lifted via item-transport so there is exactly one derivation from the contract).
 */

import type { ConditionSeverity } from '../api/item-transport.js';
import { isConditionSeverity } from '../api/item-transport.js';
import { raw, tokens } from '@nastech/design-tokens';

/** Display words, not new claims: severity classifies the *declaration*, whose text is the record. */
const SEVERITY_LABELS: Readonly<Record<ConditionSeverity, string>> = {
  cosmetic: 'Cosmetic',
  functional: 'Functional',
  unknown: 'Unknown to us',
};

const SEVERITY_COLORS: Readonly<Record<ConditionSeverity, string>> = {
  cosmetic: raw.color.ink500,
  functional: raw.color.signalCaution,
  unknown: raw.color.ink300,
};

const warned = new Set<string>();

export function SeverityChip({ severity }: { severity: ConditionSeverity }) {
  if (!isConditionSeverity(severity)) {
    const key = String(severity);
    if (!warned.has(key)) {
      warned.add(key);
      // A chip is a claim about the disclosure; new severities enter through the contract first.
      console.warn(
        `item/SeverityChip: "${key}" is not a contract severity — rendering nothing. ` +
          'Add it to ConditionCaption (api-contracts) with its disclosure wording first.',
      );
    }
    return null;
  }
  return (
    <span
      className="item-severity"
      data-severity={severity}
      style={{
        color: SEVERITY_COLORS[severity],
        border: `1px solid currentColor`,
        borderRadius: raw.radius.pill,
        padding: `0 ${raw.space.s2}`,
        fontSize: '0.75rem',
        lineHeight: 1.8,
        fontFamily: raw.type.familyText,
        whiteSpace: 'nowrap',
      }}
    >
      {SEVERITY_LABELS[severity]}
    </span>
  );
}
