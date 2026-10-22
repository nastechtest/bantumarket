import { CLAIM_SCOPE_DISCLOSURE, type ClaimScope } from '@nastech/api-contracts';
import { raw, tokens } from '@nastech/design-tokens';

/**
 * Claim-scope banner (brief 03, module 8).
 *
 * Persistent, visible, non-closable — the component has no close affordance to remove, which is
 * stronger than a handler that refuses to close. Its whole text is
 * `CLAIM_SCOPE_DISCLOSURE[claimScope]`, read from the contract at render time; a test pins the
 * equality so a future "tidier" rewording fails CI instead of quietly shipping.
 *
 * Legible over any scene background: opaque ink-900 plate with paper text and a hairline accent
 * border — holds contrast over the white studio canvas, a dark scene, and the poster underneath
 * it (rule 1: the static path carries the same statement). Survives reduced motion because it
 * has no motion: no transition, no animation, nothing to disable.
 */

export interface ClaimScopeBannerProps {
  readonly claimScope: ClaimScope;
}

export function ClaimScopeBanner({ claimScope }: ClaimScopeBannerProps) {
  return (
    <div
      className="nt-claim-scope-banner"
      role="note"
      aria-label="What this model evidences"
      style={{
        pointerEvents: 'none',
        padding: `${raw.space.s2} ${raw.space.s3}`,
        background: tokens.surface.inverse,
        color: tokens.text.onInverse,
        border: `1px solid ${raw.color.accent300}`,
        borderRadius: raw.radius.sm,
        font: `400 12px/1.4 ${raw.type.familyText}`,
        maxWidth: 420,
      }}
    >
      {CLAIM_SCOPE_DISCLOSURE[claimScope]}
    </div>
  );
}
