import { describe, expect, test } from 'bun:test';
import { CLAIM_SCOPE_DISCLOSURE, type ClaimScope } from '@nastech/api-contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClaimScopeBanner } from './claim-scope-banner.js';
import { textOf } from './overlay-fixtures.js';

const SCOPES: readonly ClaimScope[] = ['geometry_and_external_condition', 'condition_only', 'none'];

describe('ClaimScopeBanner', () => {
  test('for every scope the banner text IS the contract string — no local paraphrase', () => {
    for (const scope of SCOPES) {
      const html = renderToStaticMarkup(<ClaimScopeBanner claimScope={scope} />);
      expect(textOf(html)).toBe(CLAIM_SCOPE_DISCLOSURE[scope]);
    }
  });

  test('the banner is not closable: it renders no interactive affordance at all', () => {
    const html = renderToStaticMarkup(<ClaimScopeBanner claimScope="none" />);
    expect(html).not.toContain('<button');
    expect(html).not.toMatch(/close|dismiss/i);
  });

  test('legible over any background: opaque plate, not a translucent wash', () => {
    const html = renderToStaticMarkup(<ClaimScopeBanner claimScope="condition_only" />);
    expect(html).toMatch(/background:#0B0D10/i);
    expect(html).toMatch(/color:#FFFFFF/i);
    expect(html).not.toMatch(/rgba?\(/i);
  });

  test('survives reduced motion because it carries no motion', () => {
    const html = renderToStaticMarkup(<ClaimScopeBanner claimScope="condition_only" />);
    expect(html).not.toMatch(/animation|transition/i);
  });
});
