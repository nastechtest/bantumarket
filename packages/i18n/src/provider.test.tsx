/**
 * Provider + useTranslation, rendered to static markup (react-dom/server), the way the repo's other
 * component tests do. This proves the React surface the feature agents in this wave build against:
 * `useTranslation()` returns a working `t`, the active locale and direction; a controlled provider
 * renders its own translations; an allowlisted gap still renders a real string AND records the gap so
 * it is not silent English; and using the hook with no provider throws rather than rendering a lying
 * default. Interaction (setLocale persisting) is covered in `detect-persist.test.ts`.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Provider, useTranslation } from './index.js';
import { getGapReport, resetGaps } from './missing.js';
import type { MessageKey } from './catalogue/en.js';

function Text({ k, values }: { k: MessageKey; values?: Record<string, string | number> }) {
  const { t } = useTranslation();
  return <span>{t(k, values)}</span>;
}

function Dir() {
  const { dir } = useTranslation();
  return <span>dir={dir}</span>;
}

describe('<Provider> + useTranslation', () => {
  beforeEach(() => resetGaps());

  it('renders a controlled locale’s own translations', () => {
    const html = renderToStaticMarkup(
      <Provider locale="zu" detect={false}>
        <Text k="listing.buy" />
        <Text k="nav.home" />
      </Provider>,
    );
    expect(html).toContain('Thenga');
    expect(html).toContain('Ikhaya');
  });

  it('exposes text direction (all launch locales are ltr)', () => {
    const html = renderToStaticMarkup(
      <Provider locale="af" detect={false}>
        <Dir />
      </Provider>,
    );
    expect(html).toContain('dir=ltr');
  });

  it('renders Afrikaans plural agreement through t()', () => {
    const html = renderToStaticMarkup(
      <Provider locale="af" detect={false}>
        <Text k="search.results" values={{ count: 1 }} />
        <Text k="search.results" values={{ count: 7 }} />
      </Provider>,
    );
    expect(html).toContain('1 resultaat');
    expect(html).toContain('7 resultate');
  });

  it('serves a real string for an isiZulu gap and records it (never silent English)', () => {
    // nav.categories is allowlisted untranslated in isiZulu.
    const html = renderToStaticMarkup(
      <Provider locale="zu" route="/categories" detect={false}>
        <Text k="nav.categories" />
      </Provider>,
    );
    expect(html).toContain('Categories'); // the English fallback is shown, honestly
    const gaps = getGapReport();
    expect(gaps.length).toBe(1);
    expect(gaps[0]).toMatchObject({ key: 'nav.categories', requested: 'zu', servedBy: 'en', route: '/categories' });
  });

  it('throws when useTranslation is used outside a Provider (no lying default)', () => {
    expect(() => renderToStaticMarkup(<Text k="nav.home" />)).toThrow(/Provider/);
  });
});
