import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiError } from '@nastech/api-client';
import type { SearchFacet } from '@nastech/api-client';
import { defaultSearchState } from './types.js';
import type { SearchState } from './types.js';
import { ZeroResult } from './zero-result/zero-result.js';
import { NoIndexYet } from './zero-result/no-index-yet.js';
import { relatedCategories } from './zero-result/related-categories.js';

/**
 * The two screens the pilot's supply plan reads as opposite facts must be textually opposite:
 * zero results says "the index answered, nothing matches"; search failure says "the index did
 * not answer". The tests below pin that no sentence ever crosses the boundary.
 */

const NO_RESULT_PHRASES = [
  'Nothing found',
  'No listings match',
  'no listings',
  'Nothing matched',
] as const;

const FAILURE_PHRASES = ['not answering', 'could not ask the question'] as const;

const zeroState: SearchState = { ...defaultSearchState(), q: 'omega seamaster', locations: ['sandton'] };

const zeroFacets: readonly SearchFacet[] = [
  {
    name: 'category',
    values: [
      { value: 'pre-owned-watches', count: 0 },
      { value: 'pocket-watches', count: 2 },
      { value: 'watch-straps', count: 4 },
      { value: 'clocks', count: 1 },
      { value: 'watch-tools', count: 0 },
    ],
  },
];

const noop = () => undefined;

describe('zero-result screen', () => {
  test('echoes the query, flags itself as a supply signal, offers one broadening action', () => {
    const markup = renderToStaticMarkup(
      <ZeroResult state={zeroState} facets={zeroFacets} onClearFilters={noop} onSeeAll={noop} onPickCategory={noop} />,
    );
    expect(markup).toContain('omega seamaster');
    expect(markup).toContain('data-variant="zero-results"');
    expect(markup).toContain('data-supply-signal="true"');
    expect(markup).toContain('Clear filters'); // filters are on ⇒ the one action is remove them
    expect(markup).toContain('Nothing found for');
  });

  test('when no filters are on, the single action becomes see-everything, not a dead "clear"', () => {
    const bare: SearchState = { ...defaultSearchState(), q: 'Rolex Daytona' };
    const markup = renderToStaticMarkup(
      <ZeroResult state={bare} facets={[]} onClearFilters={noop} onSeeAll={noop} onPickCategory={noop} />,
    );
    expect(markup).toContain('See all pilot listings');
    expect(markup).not.toContain('Clear filters');
  });

  test('related categories come from the response counts only — zero-count categories are never suggested', () => {
    const markup = renderToStaticMarkup(
      <ZeroResult state={zeroState} facets={zeroFacets} onClearFilters={noop} onSeeAll={noop} onPickCategory={noop} />,
    );
    expect(markup).toContain('Watch straps (4)');
    expect(markup).toContain('Pocket watches (2)');
    expect(markup).not.toContain('Watch tools');
    expect(markup).not.toContain('Pre-owned watches (0)');
  });

  test('it never contains failure-screen words', () => {
    const markup = renderToStaticMarkup(
      <ZeroResult state={zeroState} facets={zeroFacets} onClearFilters={noop} onSeeAll={noop} onPickCategory={noop} />,
    );
    for (const phrase of FAILURE_PHRASES) {
      expect(markup).not.toContain(phrase);
    }
  });
});

describe('no-index-yet screen', () => {
  test('owns the failure: our problem, filters kept, a retry — and not one word about matching nothing', () => {
    const error = new ApiError({ kind: 'network' });
    const markup = renderToStaticMarkup(<NoIndexYet error={error} onRetry={noop} />);
    expect(markup).toContain('data-variant="search-failed"');
    expect(markup).toContain('Search is not answering');
    expect(markup).toContain('problem on our side');
    expect(markup).toContain('Try the search again');
    expect(markup).toContain('data-error-kind="network"');
    for (const phrase of NO_RESULT_PHRASES) {
      expect(markup).not.toContain(phrase);
    }
    // The per-kind copy comes from the api-client safety table, unchanged.
    expect(markup).toContain(error.message);
  });

  test('renders usefully even with no error object (defensive: a failure screen that crashes is a spinner)', () => {
    const markup = renderToStaticMarkup(<NoIndexYet error={null} onRetry={noop} />);
    expect(markup).toContain('Search is not answering');
    expect(markup).not.toContain('undefined');
  });

  test('it never contains zero-result screen words', () => {
    const markup = renderToStaticMarkup(<NoIndexYet error={new ApiError({ kind: 'timeout' })} onRetry={noop} />);
    expect(markup).not.toContain('Nothing found');
    expect(markup).not.toContain('data-variant="zero-results"');
  });
});

describe('related-categories reader', () => {
  test('ranks by real count, excludes the already-selected, caps at three', () => {
    const facets: readonly SearchFacet[] = [
      {
        name: 'category',
        values: [
          { value: 'watch-straps', count: 4 },
          { value: 'pocket-watches', count: 2 },
          { value: 'clocks', count: 1 },
          { value: 'pre-owned-watches', count: 9 },
        ],
      },
    ];
    const out = relatedCategories(facets, ['pre-owned-watches']);
    expect(out.map((entry) => entry.slug)).toEqual(['watch-straps', 'pocket-watches', 'clocks']);
    expect(out[0]!.count).toBe(4);
  });

  test('an absent category facet yields no suggestions — silence beats invention', () => {
    expect(relatedCategories([], [])).toEqual([]);
  });
});
