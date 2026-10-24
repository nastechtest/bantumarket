import { describe, expect, it } from 'bun:test';
import { ApiError } from '../src/errors.js';
import { getListingSummary, searchCatalogue } from '../src/catalogue.js';
import { FakeTransport, listingSummaryFixture } from './fake-transport.js';

describe('search distinguishes the three things a buyer cannot tell apart', () => {
  it('empty result set from a healthy server is no_matches, not failed', async () => {
    const transport = new FakeTransport();
    transport.respond(() => ({ items: [], totalMatched: 0, facets: [{ name: 'brand', values: [] }] }));

    const outcome = await searchCatalogue(transport, { query: 'seiko diver', limit: 20 });
    expect(outcome.kind).toBe('no_matches');
    if (outcome.kind === 'no_matches') {
      expect(outcome.facets).toHaveLength(1);
    }
  });

  it('a broken search is failed with its classified error, never an empty array', async () => {
    const transport = new FakeTransport();
    transport.respond(() => {
      throw new ApiError({ kind: 'providerUnavailable', httpStatus: 503 });
    });

    const outcome = await searchCatalogue(transport, { query: 'seiko' });
    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') {
      expect(outcome.error.kind).toBe('providerUnavailable');
      expect(outcome.error.retryable).toBe(true);
    }
  });

  it('results carry cursor pagination and facet counts', async () => {
    const transport = new FakeTransport();
    transport.respond(() => ({
      items: [listingSummaryFixture('lst_1'), listingSummaryFixture('lst_2')],
      totalMatched: 137,
      nextCursor: 'cur_page2',
      facets: [{ name: 'brand', values: [{ value: 'seiko', count: 91 }] }],
    }));

    const outcome = await searchCatalogue(transport, {
      query: 'watch',
      filters: { brand: 'seiko', priceMaxCents: 600000 },
      cursor: 'cur_page1',
      limit: 20,
    });
    expect(outcome.kind).toBe('results');
    if (outcome.kind !== 'results') return;
    expect(outcome.items.map((item) => item.id)).toEqual(['lst_1', 'lst_2']);
    expect(outcome.nextCursor).toBe('cur_page2');
    expect(outcome.facets[0]?.values[0]?.count).toBe(91);

    const call = transport.calls[0];
    expect(call?.query?.['f.brand']).toBe('seiko');
    expect(call?.query?.['f.priceMaxCents']).toBe(600000);
    expect(call?.query?.['cursor']).toBe('cur_page1');
  });

  it('a dropped connection on search retries once and still resolves as results', async () => {
    const transport = new FakeTransport();
    transport
      .respond(() => {
        throw new ApiError({ kind: 'network' });
      })
      .respond(() => ({ items: [listingSummaryFixture()], totalMatched: 1 }));

    const outcome = await searchCatalogue(transport, { query: 'seiko' }, { timeoutMs: 100 });
    expect(outcome.kind).toBe('results');
    expect(transport.calls.length).toBe(2);
  });

  it('a non-ApiError from a buggy transport is not swallowed into `failed`', async () => {
    const transport = new FakeTransport();
    transport.respond(() => {
      throw new TypeError('caller-side programming error');
    });
    let escaped = false;
    try {
      await searchCatalogue(transport, {});
    } catch (error) {
      escaped = error instanceof TypeError;
    }
    expect(escaped).toBe(true);
  });
});

describe('catalogue timeouts', () => {
  it('every catalogue entrypoint enforces the deadline as a timeout error', async () => {
    const transport = new FakeTransport();
    transport.alwaysHangs();

    const searchOutcome = await searchCatalogue(transport, {}, { timeoutMs: 5 });
    expect(searchOutcome.kind).toBe('failed');
    if (searchOutcome.kind === 'failed') {
      expect(searchOutcome.error.kind).toBe('timeout');
    }

    let listingError = '';
    try {
      await getListingSummary(transport, 'lst_1', { timeoutMs: 5 });
    } catch (error) {
      listingError = error instanceof ApiError ? error.kind : 'unclassified';
    }
    expect(listingError).toBe('timeout');
  });
});
