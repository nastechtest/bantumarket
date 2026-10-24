/**
 * The external route, given in the same breath as the refusal.
 *
 * "We cannot decide this" is a door closing; a dispute screen that closes it has an obligation to say
 * where the hinge is. These are South African routes because this is a South African launch, and they
 * are phrased as things you may do rather than things that will work: an outcome nobody can promise is
 * an outcome nobody may imply by formatting.
 *
 * Copy here is a starting point for a reader, not legal advice, and not a statement of NasTech's
 * position — it needs the same review as every other string a buyer is trusted with.
 */

import { raw, tokens } from '@nastech/design-tokens';
import type { ClaimVerdict, RecourseOption } from '../claim-scope.js';
import { EXTERNAL_RECOURSE } from '../claim-scope.js';
import { Body, Panel } from '../ui.js';

export interface ExternalRecourseProps {
  readonly verdict?: ClaimVerdict | null;
  /** Inside the scope panel: framed as part of the refusal rather than as its own section. */
  readonly embedded?: boolean;
}

/** The set to show: claims outside the platform's scope pick the channel. With nothing to choose, all
 *  of them are listed — a buyer who is not sure which category they are in should not have to guess
 *  before they can see an option. */
export function recourseFor(verdict: ClaimVerdict | null | undefined): readonly RecourseOption[] {
  if (verdict === null || verdict === undefined) return EXTERNAL_RECOURSE;
  if (verdict.recourse.length > 0) return verdict.recourse;
  return EXTERNAL_RECOURSE;
}

export function RecourseRow({ option }: { option: RecourseOption }) {
  return (
    <li
      style={{
        display: 'grid',
        gap: raw.space.s1,
        border: `1px solid ${raw.color.ink100}`,
        borderRadius: raw.radius.md,
        padding: raw.space.s3,
        background: tokens.surface.primary,
      }}
    >
      <strong style={{ fontFamily: raw.type.familyText, fontSize: '0.9375rem', color: tokens.text.primary }}>
        {option.where}
      </strong>
      <span style={{ fontSize: '0.875rem', lineHeight: 1.5, color: tokens.text.primary }}>{option.whatYouGet}</span>
      <span style={{ fontSize: '0.8125rem', lineHeight: 1.5, color: tokens.text.secondary }}>{option.howToStart}</span>
      <span style={{ fontSize: '0.8125rem', color: raw.color.ink500 }}>{option.costNote}</span>
    </li>
  );
}

export function ExternalRecourse({ verdict = null, embedded = false }: ExternalRecourseProps) {
  const options = recourseFor(verdict);
  const list = (
    <ul
      id={embedded ? 'dp-recourse-inline' : 'dp-recourse'}
      data-testid="dp-recourse"
      style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: raw.space.s2 }}
    >
      {options.map((option) => (
        <RecourseRow key={option.key} option={option} />
      ))}
    </ul>
  );

  if (embedded) {
    return (
      <div style={{ display: 'grid', gap: raw.space.s2 }}>
        <Body size="small">
          <strong>Where you can take what we cannot decide.</strong> Not through us, and not instead of us.
          These are the channels that can look at the item itself.
        </Body>
        {list}
      </div>
    );
  }

  return (
    <Panel title="Where you can take what we cannot decide" id="dp-external-recourse">
      <div style={{ display: 'grid', gap: raw.space.s3 }}>
        <Body size="small">
          A dispute with NasTech is not your only option, and for the three questions above it is not the
          right one. These channels can examine the item itself, which is the thing we cannot do.
        </Body>
        {list}
        <Body size="small">
          None of these is a NasTech process, and nothing here predicts what any of them will conclude. If
          you send us a written assessment from one of them, it enters the case file as evidence — a
          reviewer reads it as somebody else’s finding, which is exactly what it is.
        </Body>
      </div>
    </Panel>
  );
}
