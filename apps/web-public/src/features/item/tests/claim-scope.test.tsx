import { describe, it, expect, afterEach } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ClaimScope } from '@nastech/api-contracts';
import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import { WhatThisDoesNotSay } from '../condition/what-this-does-not-say.js';

/**
 * Spec §13.2, machine-checked: the disclosure sentence is *the contract's sentence*, and the
 * surface around it may not imply a check that did not happen. These assertions are adversarial
 * by design — they scan the rendered markup for the affordances the spec bans.
 */

const SCOPES: ClaimScope[] = ['geometry_and_external_condition', 'condition_only', 'none'];

const realWarn = console.warn;
afterEach(() => {
  console.warn = realWarn;
});

describe('WhatThisDoesNotSay (claim scope)', () => {
  it('renders CLAIM_SCOPE_DISCLOSURE[scope] verbatim for every contract scope', () => {
    for (const scope of SCOPES) {
      const markup = renderToStaticMarkup(<WhatThisDoesNotSay scope={scope} />);
      // The contract string must appear character-identical, not "semantically equal".
      expect(markup).toContain(CLAIM_SCOPE_DISCLOSURE[scope]);
      expect(markup).toContain(`data-claim-scope="${scope}"`);
    }
  });

  it('contains no checkmark, tick, shield or glow affordance of any kind', () => {
    for (const scope of SCOPES) {
      const markup = renderToStaticMarkup(<WhatThisDoesNotSay scope={scope} />);
      for (const banned of ['✓', '✔', '✅', 'verified', 'Verified', 'glow', 'animation', 'box-shadow', 'checkmark', 'shield', 'assurance']) {
        expect(markup.toLowerCase(), `scope ${scope} markup contains "${banned}"`).not.toContain(banned.toLowerCase());
      }
    }
  });

  it('uses no assurance token — the one colour name reserved by design-tokens for effects no check produced is structurally absent', () => {
    // tokens.assurance maps to the greens/greys that a "verified" treatment would reach for;
    // the disclosure must not even spell those hex values, so compare against the raw palette.
    const markup = renderToStaticMarkup(<WhatThisDoesNotSay scope="geometry_and_external_condition" />);
    expect(markup).not.toContain('#0E7A4F'); // assurance.disclosed green
    expect(markup).not.toMatch(/radial-gradient|drop-shadow|filter:/);
  });

  it('refuses a scope outside the contract union: renders nothing, warns once, no paraphrased sentence', () => {
    const warnings: string[] = [];
    console.warn = (msg: string) => warnings.push(msg);
    const bogus = 'authenticity_and_movement' as unknown as ClaimScope;
    const markup = renderToStaticMarkup(<WhatThisDoesNotSay scope={bogus} />);
    expect(markup).toBe('');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('CLAIM_SCOPE_DISCLOSURE');
  });

  it('stays silent when the listing has no render to scope (photos-only listings)', () => {
    expect(renderToStaticMarkup(<WhatThisDoesNotSay scope="none" hasRender={false} />)).toBe('');
  });

  it('the component holds no local copy of the sentence: every rendered character comes from the contract table', () => {
    // If someone retypes the sentence locally, one of these equality probes will diverge as soon
    // as the contract is edited; asserting set-membership of the whole table is the cheap guard.
    const table = new Set<string>(Object.values(CLAIM_SCOPE_DISCLOSURE));
    for (const scope of SCOPES) {
      const markup = renderToStaticMarkup(<WhatThisDoesNotSay scope={scope} />);
      const sentence = markup.match(/data-claim-scope-text[^>]*>([^<]+)</)?.[1];
      expect(sentence, `no sentence found for ${scope}`).toBeDefined();
      expect(table.has(sentence!), `sentence for ${scope} is not the contract string`).toBe(true);
    }
  });
});
