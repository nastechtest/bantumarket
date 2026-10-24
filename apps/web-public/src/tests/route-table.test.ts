/**
 * Route-table contract for the buyer app.
 *
 * Two failures this pins: a `Routes` row that nothing can match, and an internal link that lands
 * on the `*` NotFound page. The link scan reads the same source the browser ships, so a new
 * `<a href>` or `goTo()` without a route goes red here rather than in production.
 */
import { beforeAll, describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { installDom } from '@nastech/testing';

let router: typeof import('../router.js');

beforeAll(async () => {
  installDom();
  router = await import('../router.js');
});

function concrete(path: string): string {
  return path.replace(/:[^/]+/g, 'sample');
}

describe('route table', () => {
  it('resolves every declared route to its own row', () => {
    for (const route of router.Routes) {
      if (route.path === '*') continue;
      const resolved = router.resolve(concrete(route.path));
      expect(resolved.path, `route ${route.path} does not resolve to itself`).toBe(route.path);
    }
  });

  it('keeps the wildcard as the only fallback', () => {
    expect(router.resolve('/no-such-page').path).toBe('*');
    expect(router.resolve('/safety/no-such-section').path).toBe('*');
  });

  it('strips and re-adds the production mount prefix without changing the match', () => {
    for (const route of router.Routes) {
      if (route.path === '*') continue;
      const mounted = router.withBase(concrete(route.path), '/buyer');
      const stripped = router.stripBase(mounted, '/buyer');
      expect(router.resolve(stripped).path, `mounted ${mounted}`).toBe(route.path);
    }
  });
});

const SKIP_DIRS = new Set(['node_modules', 'tests', 'test-support']);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    if (/\.test\.(ts|tsx)$/.test(name)) continue;
    out.push(full);
  }
  return out;
}

const LINK_PATTERNS = [
  /href="(\/[^"]*)"/g,
  /href='(\/[^']*)'/g,
  /href=\{`(\/[^`]*)`\}/g,
  /goTo\('(\/[^']*)'\)/g,
  /\bhref:\s*'(\/[^']*)'/g,
];

export function internalLinks(): string[] {
  const src = new URL('..', import.meta.url).pathname;
  const found = new Set<string>();
  for (const file of sourceFiles(src)) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of LINK_PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        const raw = match[1];
        if (raw === undefined) continue;
        const path = raw
          .replace(/\$\{[^}]*\}/g, 'sample')
          .split(/[?#]/)[0];
        if (path === undefined || path === '') continue;
        if (path === '/') {
          found.add('/');
          continue;
        }
        if (/^\/(v\d+|icons|assets|manifest)/.test(path)) continue;
        found.add(path.replace(/\/+$/, ''));
      }
    }
  }
  return [...found].sort();
}

describe('internal links', () => {
  it('finds the link set rather than silently scanning nothing', () => {
    const links = internalLinks();
    expect(links.length).toBeGreaterThan(20);
    expect(links).toContain('/safety/report');
    expect(links).toContain('/account/data-request');
    expect(links).toContain('/sell');
  });

  it('never sends an internal link to the NotFound route', () => {
    for (const link of internalLinks()) {
      expect(router.resolve(link).path, `internal link ${link} resolves to NotFound`).not.toBe('*');
    }
  });
});
