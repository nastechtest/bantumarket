import { TIER_LABELS } from '@nastech/api-contracts';
import type { VerificationTier } from '@nastech/api-contracts';
import { raw, tokens } from '@nastech/design-tokens';

/** Widened index so a runtime-invalid tier yields `undefined` instead of lying about `string`. */
const LABELS_BY_KEY: Readonly<Record<string, string | undefined>> = TIER_LABELS;

export function isVerificationTier(value: unknown): value is VerificationTier {
  return typeof value === 'string' && LABELS_BY_KEY[value] !== undefined;
}

const alreadyWarned = new Set<string>();

function devWarn(message: string): void {
  if (typeof process === 'undefined' || process.env.NODE_ENV !== 'production') {
    console.warn(message);
  }
}

/**
 * A trust badge is a claim. Spec §13.2 bans any effect that resembles a security guarantee when
 * no check occurred, so this component renders exactly `TIER_LABELS[tier]` and refuses everything
 * else — null output, dev warning — rather than falling back to a generic "verified" string.
 * Callers cannot invent a sixth tier on a public surface without the label existing in
 * `@nastech/api-contracts` first, which is where the disclosure review happens.
 */
export function VerificationBadge({ tier }: { tier: VerificationTier }) {
  const label = LABELS_BY_KEY[tier];
  if (label === undefined) {
    const key = String(tier);
    if (!alreadyWarned.has(key)) {
      alreadyWarned.add(key);
      devWarn(
        `design-system/VerificationBadge: "${key}" is not in TIER_LABELS — rendering nothing. ` +
          'A badge is a claim; add the tier and its disclosure to @nastech/api-contracts first.',
      );
    }
    return null;
  }
  return (
    <span
      className="ds-badge"
      data-tier={tier}
      style={{
        color: tokens.text.secondary,
        border: `1px solid ${raw.color.ink100}`,
        borderRadius: raw.radius.pill,
        padding: `${raw.space.s1} ${raw.space.s2}`,
        fontSize: '0.8125rem',
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}
