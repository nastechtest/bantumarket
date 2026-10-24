/**
 * The mount prefix is a build flag, not a rewrite of the app: every route match strips it and every
 * history entry adds it. These assertions are the contract that lets one deployment serve the app at
 * `/`, `/seller/` or `/staff/` without the app knowing which.
 *
 * The router binds `popstate` and a delegated click listener at module scope, so it is imported after
 * the DOM exists — the same order a browser gives it.
 */
import { beforeAll, describe, expect, it } from 'bun:test';
import { installDom } from '@nastech/testing';

let router: typeof import('./router.js');

beforeAll(async () => {
  installDom();
  router = await import('./router.js');
});

describe('mount base', () => {
  it('strips the prefix before matching, and leaves a root deployment untouched', () => {
    expect(router.stripBase('/seller/item/7', '/seller')).toBe('/item/7');
    expect(router.stripBase('/seller', '/seller')).toBe('/');
    expect(router.stripBase('/seller/', '/seller')).toBe('/');
    expect(router.stripBase('/item/7', '')).toBe('/item/7');
  });

  it('does not strip a path that merely starts with the same letters', () => {
    expect(router.stripBase('/sellerish/item', '/seller')).toBe('/sellerish/item');
    expect(router.stripBase('/staffroom', '/staff')).toBe('/staffroom');
  });

  it('adds the prefix to every history entry, with or without a leading slash', () => {
    expect(router.withBase('/item/7', '/seller')).toBe('/seller/item/7');
    expect(router.withBase('item/7', '/seller')).toBe('/seller/item/7');
    expect(router.withBase('/', '/staff')).toBe('/staff/');
    expect(router.withBase('/item/7', '')).toBe('/item/7');
  });

  it('resolves to the same route before and after being mounted', () => {
    expect(router.resolve(router.stripBase('/seller/', '/seller'))).toEqual(router.resolve('/'));
    expect(router.resolve(router.stripBase('/seller/no-such-page', '/seller'))).toEqual(router.resolve('/no-such-page'));
  });
});
