/**
 * The claim-scope sentence. Spec §13.2 is review-blocking: a render must never imply a check that
 * did not happen, so this component (a) takes the sentence *only* from
 * `CLAIM_SCOPE_DISCLOSURE[scope]` in @nastech/api-contracts — no local variants, no paraphrase,
 * because the dispute process reads this exact text; (b) renders no checkmark, tick, glow, shield,
 * green "verified" pill or animation of any kind — there is deliberately no icon import here; and
 * (c) refuses a scope outside the contract union the way VerificationBadge refuses a fake tier:
 * nothing renders and a dev warning names the offender.
 */

import type { ClaimScope } from '@nastech/api-contracts';
import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import { raw, tokens } from '@nastech/design-tokens';

/** Widened index so a runtime-invalid scope yields undefined instead of lying about string. */
const DISCLOSURES_BY_SCOPE: Readonly<Record<string, string | undefined>> = CLAIM_SCOPE_DISCLOSURE;

const warned = new Set<string>();

export interface WhatThisDoesNotSayProps {
  readonly scope: ClaimScope;
  /** When false (a listing with no capture at all), the sentence about *a model* would be a lie. */
  readonly hasRender?: boolean;
}

export function WhatThisDoesNotSay({ scope, hasRender = true }: WhatThisDoesNotSayProps) {
  if (!hasRender) return null;
  const sentence = DISCLOSURES_BY_SCOPE[scope];
  if (sentence === undefined) {
    const key = String(scope);
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(
        `item/WhatThisDoesNotSay: "${key}" is not in CLAIM_SCOPE_DISCLOSURE — rendering nothing. ` +
          'A scope is a claim boundary; add it to @nastech/api-contracts with its disclosure wording first.',
      );
    }
    return null;
  }
  return (
    <section
      className="item-claim-scope"
      data-claim-scope={scope}
      style={{
        borderLeft: `3px solid ${tokens.action.default}`,
        background: tokens.surface.raised,
        borderRadius: raw.radius.sm,
        padding: raw.space.s4,
        fontFamily: raw.type.familyText,
        color: tokens.text.primary,
      }}
    >
      <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600 }}>What this does not say</h3>
      {/* The sentence renders as its own text node, unmodified, so tests (and a dispute) can read
          exactly the contract string out of the DOM. */}
      <p data-claim-scope-text="" style={{ margin: 0, marginTop: raw.space.s2, fontSize: '0.875rem', lineHeight: 1.5 }}>
        {sentence}
      </p>
      <p style={{ margin: 0, marginTop: raw.space.s2, fontSize: '0.8125rem', color: tokens.text.secondary }}>
        The written condition record on this page is the evidence. Photographs and any 3D view are
        pointers to it, never replacements for it.
      </p>
    </section>
  );
}
