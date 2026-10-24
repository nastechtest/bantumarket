/**
 * The panel this whole feature exists to make unavoidable.
 *
 * A 3D model of a pre-owned watch is produced from photographs of its outside. It is convincing —
 * that is the problem. Rotation implies a serviced movement, a clean case implies a genuine one, and
 * nothing in the render says "this cannot tell you any of those". `claim_scope` in
 * `@nastech/api-contracts` is the machine-readable version of the sentence that does, and this
 * component prints it verbatim, because a paraphrase of a disclosure is a new disclosure.
 *
 * Rules held here:
 *   - not collapsible, not a footnote, not dismissed by a close button;
 *   - no "verified" affordance, no green, no check mark, no motion — spec §13.2 treats a trust
 *     animation no check produced as a review blocker, and a dispute screen is where that check
 *     would be believed most readily;
 *   - where a claim sits outside the scope, the external route is given in the same panel rather than
 *     on a later page, because "we cannot help with that" without a next step is how a buyer ends up
 *     with nowhere to take it.
 */

import { raw, tokens } from '@nastech/design-tokens';
import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import type { ClaimVerdict } from '../claim-scope.js';
import { CLAIM_KIND_LABELS } from '../claim-scope.js';
import { Body, Panel } from '../ui.js';
import { ExternalRecourse } from './external-recourse.js';

/** The three claims that end up here most often, named for the reader who is not sure which one
 *  theirs is. Mirrors `claimIsOutsidePlatformScope` — if that grows, this list grows with it. */
export const OUT_OF_SCOPE_HEADLINE =
  'What NasTech cannot verify, whatever this dispute contains';

export const OUT_OF_SCOPE_GENERIC: readonly string[] = [
  CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition,
  'Whether a watch movement runs, and how much time it gains or loses, cannot be seen in a photograph or a 3D model.',
  'Whether a watch is water-resistant cannot be seen in a photograph or a 3D model. That is a pressure-bench test, and we do not have the item.',
  'Whether a watch is genuine cannot be seen in a photograph or a 3D model. We have not opened a caseback, and no image of one tells you whether the parts inside match.',
];

export interface WhatWeCannotProps {
  readonly verdict?: ClaimVerdict | null;
  /** The intake screen's version: the same sentences, less framing, so it is never skipped for space. */
  readonly compact?: boolean;
}

export function WhatWeCannot({ verdict = null, compact = false }: WhatWeCannotProps) {
  const lines =
    verdict !== null && verdict.cannotVerifyLines.length > 0
      ? verdict.cannotVerifyLines
      : OUT_OF_SCOPE_GENERIC.slice(1);
  const quotedScope = verdict?.renderDisclosure ?? CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition;
  const outside = verdict?.outsideClaims ?? [];

  return (
    <div id="dp-cannot" data-compact={compact ? 'true' : 'false'}>
      <Panel tone="scope" title={OUT_OF_SCOPE_HEADLINE} meta="This is part of your dispute record, not a warning you can acknowledge away.">
        <div style={{ display: 'grid', gap: raw.space.s3 }}>
          <Body size={compact ? 'small' : 'base'}>
            The pictures on this listing — including the 3D model, which cost real money to make and looks
            authoritative because it does — were made from photographs of the outside of the item. Here is
            the sentence the platform is held to, in its own words:
          </Body>

          <blockquote
            style={{
              margin: 0,
              padding: `${raw.space.s3} ${raw.space.s4}`,
              borderLeft: `3px solid ${raw.color.signalCaution}`,
              background: tokens.surface.raised,
              borderRadius: `0 ${raw.radius.md} ${raw.radius.md} 0`,
              fontFamily: raw.type.familyText,
              fontSize: '0.9375rem',
              lineHeight: 1.55,
              color: tokens.text.primary,
            }}
          >
            {quotedScope}
          </blockquote>

          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: raw.space.s2 }}>
            {lines.map((line) => (
              <li
                key={line}
                style={{
                  display: 'flex',
                  gap: raw.space.s2,
                  fontFamily: raw.type.familyText,
                  fontSize: compact ? '0.8125rem' : '0.9375rem',
                  lineHeight: 1.55,
                  color: tokens.text.primary,
                }}
              >
                {/* An X, not a tick, and not coloured green anywhere in this panel: a border that is
                    absent is not an assurance that it held. */}
                <span aria-hidden="true" style={{ color: raw.color.signalCaution, fontWeight: 700 }}>
                  ✕
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>

          {outside.length > 0 ? (
            <Body size="small">
              Your dispute includes{' '}
              <strong>{outside.map((k) => CLAIM_KIND_LABELS[k].toLowerCase()).join(' and ')}</strong>. We will
              read your account of it carefully and we will record what the seller said about it. We will not
              tell you we have established it, because we cannot establish it from here.
            </Body>
          ) : (
            <Body size="small">
              Your dispute is about something a reviewer can compare against the listing. That sentence still
              applies to the pictures you are comparing: they show the outside, and only the outside.
            </Body>
          )}

          {!compact ? (
            <Body size="small">
              A refund or a partial refund on a claim like this is a decision about what the listing said and
              what the record shows. It is not, and must not be read as, a finding that the item is broken,
              that it leaked, or that it is not genuine.
            </Body>
          ) : null}

          <ExternalRecourse verdict={verdict} embedded />
        </div>
      </Panel>
    </div>
  );
}
