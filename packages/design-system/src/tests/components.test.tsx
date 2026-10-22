import { describe, it, expect } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmptyState } from '../empty-state.js';
import { Stepper } from '../stepper.js';
import { Disclosure, ClaimScopeDisclosure } from '../disclosure.js';
import { PolicyLinks } from '../policy-links.js';
import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import { Stack } from '../stack.js';
import { Grid, StyleSheet, gridCss } from '../grid.js';
import { raw } from '@nastech/design-tokens';

describe('EmptyState', () => {
  it('echoes the actual search terms — the query is the supply signal', () => {
    const markup = renderToStaticMarkup(
      <EmptyState query="Seiko 5 blue" actionLabel="Clear filters" onAction={() => {}} />,
    );
    expect(markup).toContain('Seiko 5 blue');
  });

  it('offers exactly one action and is tagged for staff', () => {
    const markup = renderToStaticMarkup(
      <EmptyState query="chronograph" actionLabel="Widen search" onAction={() => {}} />,
    );
    expect(markup.match(/<button/g)?.length).toBe(1);
    expect(markup).toContain('data-variant="zero-results"');
    expect(markup).toContain('Widen search');
  });
});

describe('Stepper', () => {
  const steps = [{ label: 'Basket' }, { label: 'Checkout' }, { label: 'Handover' }];

  it('announces the current step exactly once via aria-current', () => {
    const markup = renderToStaticMarkup(<Stepper steps={steps} currentIndex={1} />);
    expect(markup.match(/aria-current="step"/g)?.length).toBe(1);
    expect(markup).toContain('aria-current="step"');
    expect(markup).toMatch(/aria-current="step"[^>]*>\s*2\. Checkout/);
  });

  it('distinguishes done from todo without leaning on colour alone', () => {
    const markup = renderToStaticMarkup(<Stepper steps={steps} currentIndex={2} />);
    expect(markup).toContain('data-state="done"');
    expect(markup).toContain('data-state="current"');
    expect(markup.match(/data-state="done"/g)?.length).toBe(2);
  });
});

describe('Disclosure', () => {
  it('renders the contract claim-scope text verbatim', () => {
    const markup = renderToStaticMarkup(<ClaimScopeDisclosure scope="geometry_and_external_condition" />);
    expect(markup).toContain(CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition);
    expect(markup).toContain('data-tone="claim"');
  });

  it('keeps one visual weight across tones — only the accent differs', () => {
    const warning = renderToStaticMarkup(
      <Disclosure tone="warning" title="Hand your item over in person">Meet at a police station.</Disclosure>,
    );
    expect(warning).toContain('data-tone="warning"');
    expect(warning).toContain(raw.color.signalCaution);
  });
});

describe('PolicyLinks', () => {
  it('always presents POPIA, CPA returns and terms as a labelled nav', () => {
    const markup = renderToStaticMarkup(<PolicyLinks />);
    expect(markup).toContain('<nav');
    expect(markup).toContain('aria-label="Legal and policy"');
    expect(markup).toContain('/legal/privacy');
    expect(markup).toContain('/legal/returns');
    expect(markup).toContain('/legal/terms');
    expect(markup).toContain('POPIA');
    expect(markup).toContain('CPA');
  });
});

describe('layout primitives', () => {
  it('Stack takes its gap from the token scale, not a magic number', () => {
    const markup = renderToStaticMarkup(<Stack gap="s4"><span>a</span><span>b</span></Stack>);
    expect(markup).toContain(`gap:${raw.space.s4}`);
    expect(markup).toContain('data-gap="s4"');
  });

  it('Grid is container-query based with a one-column mobile default', () => {
    const markup = renderToStaticMarkup(<Grid><span>card</span></Grid>);
    expect(markup).toContain('ds-grid-host');
    expect(markup).toContain('ds-grid');
    expect(gridCss).toContain('container-type:inline-size');
    expect(gridCss).toContain('@container ds-grid (min-width: 30rem)');
    expect(gridCss).toContain('.ds-grid{display:grid;grid-template-columns:1fr');
  });

  it('StyleSheet emits the layout css for one mount at the app root', () => {
    const markup = renderToStaticMarkup(<StyleSheet />);
    expect(markup).toContain('<style');
    expect(markup).toContain('@container');
  });
});
