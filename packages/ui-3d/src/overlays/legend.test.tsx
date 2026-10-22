import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import { Legend } from './legend.js';
import { makeCaption, textOf } from './overlay-fixtures.js';

describe('<Legend/>', () => {
  test('the claim-scope sentence is the contract string, byte for byte, for every scope', () => {
    for (const scope of ['geometry_and_external_condition', 'condition_only', 'none'] as const) {
      const html = renderToStaticMarkup(
        <Legend claimScope={scope} captions={[makeCaption('a', [0, 0, 0.02])]} metersPerUnit={1} showCalipers={false} />,
      );
      expect(textOf(html)).toContain(CLAIM_SCOPE_DISCLOSURE[scope]);
    }
  });

  test('only severities actually present are listed — the legend never advertises an absent marker', () => {
    const html = renderToStaticMarkup(
      <Legend claimScope="condition_only" captions={[makeCaption('a', [0, 0, 0.02], { severity: 'unknown' })]} metersPerUnit={1} showCalipers={false} />,
    );
    const text = textOf(html);
    expect(text).toContain('Not checked');
    expect(text).not.toContain('Cosmetic');
    expect(text).not.toContain('Affects function');
  });

  test('empty captions say so plainly instead of showing a legend for markers that do not exist', () => {
    const html = renderToStaticMarkup(<Legend claimScope="none" captions={[]} metersPerUnit={1} showCalipers={false} />);
    expect(textOf(html)).toContain('No condition markers on this model.');
  });

  test('missing alignment is disclosed as missing, and no mm-bar promise is made', () => {
    const html = renderToStaticMarkup(
      <Legend claimScope="condition_only" captions={[makeCaption('a', [0, 0, 0.02], { severity: 'cosmetic' })]} metersPerUnit={null} showCalipers={true} />,
    );
    const text = textOf(html);
    expect(text).toContain('Measurements unavailable');
    expect(text).not.toContain('mm bar');
    expect(text).not.toContain('Calipers:');
  });

  test('with alignment, the bar row names the 10 mm reference and the caliper row appears only with calipers', () => {
    const html = renderToStaticMarkup(
      <Legend claimScope="condition_only" captions={[makeCaption('a', [0, 0, 0.02], { severity: 'cosmetic' })]} metersPerUnit={0.001} showCalipers={true} />,
    );
    const text = textOf(html);
    expect(text).toContain('10 mm bar');
    expect(text).toContain('Dashed calipers');
    expect(text).toContain('pointers to disclosure records');
  });
});
