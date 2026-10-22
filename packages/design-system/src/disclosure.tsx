import type { ReactNode } from 'react';
import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import type { ClaimScope } from '@nastech/api-contracts';
import { raw, tokens } from '@nastech/design-tokens';

export type DisclosureTone = 'claim' | 'policy' | 'warning';

/**
 * One callout for claim scope, returns policy and handover warnings so "you should read this"
 * has the same visual weight everywhere. The tone changes the accent edge only — never the
 * layout — so no tone can look more or less ignorable than another by accident.
 */
const TONE_EDGE: Record<DisclosureTone, string> = {
  claim: tokens.action.default,
  policy: raw.color.ink300,
  warning: raw.color.signalCaution,
};

export function Disclosure({
  tone,
  title,
  children,
}: {
  tone: DisclosureTone;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      className="ds-disclosure"
      data-tone={tone}
      style={{
        borderLeft: `3px solid ${TONE_EDGE[tone]}`,
        background: tokens.surface.raised,
        borderRadius: raw.radius.sm,
        padding: raw.space.s4,
        color: tokens.text.primary,
        fontFamily: raw.type.familyText,
      }}
    >
      <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600 }}>{title}</h3>
      <div style={{ marginTop: raw.space.s2, fontSize: '0.875rem', lineHeight: 1.5 }}>{children}</div>
    </section>
  );
}

/**
 * Renders the contract's disclosure string verbatim. The text is what the dispute process reads,
 * so a paraphrase here is a defect; the component exists to make paraphrasing structurally
 * awkward — pass the scope, get the sentence.
 */
export function ClaimScopeDisclosure({ scope }: { scope: ClaimScope }) {
  return <Disclosure tone="claim" title="What this picture shows">{CLAIM_SCOPE_DISCLOSURE[scope]}</Disclosure>;
}
