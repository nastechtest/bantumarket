import { describe, it, expect } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { raw, tokens } from '@nastech/design-tokens';
import { reducedMotionCss } from '../styles/reduced-motion.js';

/**
 * Layering + scale contracts, enforced by parsing the real files.
 *
 * Three invariants the brief names: one z-index scale, no component free-styling a number; the
 * CSS mirror matching the token module; and the reduced-motion replacement being gentler than
 * the `!important` sledgehammer it replaces, not just different.
 */

const SRC = new URL('..', import.meta.url).pathname; // apps/web-public/src
const STYLES = join(SRC, 'styles');
const LAYOUT = join(SRC, 'layout');
const PUBLIC_DIR = new URL('../../public', import.meta.url).pathname;
const CSS_FILES = readdirSync(STYLES).filter((f) => f.endsWith('.css'));

function readCss(name: string): string {
  return readFileSync(join(STYLES, name), 'utf8');
}

function zIndexDeclarations(css: string): string[] {
  return [...css.matchAll(/z-index:\s*([^;}\n]+)/g)].map((m) => m[1]!.trim());
}

describe('one z-index scale', () => {
  it('every z-index in every shell CSS file is a bare var(--nt-z-<layer>) reference', () => {
    for (const file of CSS_FILES) {
      for (const value of zIndexDeclarations(readCss(file))) {
        const ok = /^var\(--nt-z-[a-z]+\)$/.test(value);
        expect(ok, `${file}: z-index: ${value} is not a token reference (numeric fallbacks are free-styled numbers)`).toBe(true);
      }
    }
  });

  it('layering.css defines the scale, ascending and collision-free', () => {
    const css = readCss('layering.css');
    const layers = [...css.matchAll(/--nt-z-([a-z]+):\s*(\d+);/g)].map((m) => ({ name: m[1]!, value: Number(m[2]) }));
    expect(layers.length).toBeGreaterThanOrEqual(6);
    const names = layers.map((l) => l.name);
    expect(new Set(names).size).toBe(names.length);
    for (let i = 1; i < layers.length; i++) {
      expect(layers[i]!.value, `layer ${layers[i]!.name} must sit above ${layers[i - 1]!.name}`).toBeGreaterThan(layers[i - 1]!.value);
    }
    // Sanity: the two ordering promises the product depends on.
    const by = Object.fromEntries(layers.map((l) => [l.name, l.value]));
    expect(by.offline!).toBeGreaterThan(by.header!);
    expect(by.buybar!).toBeGreaterThan(by.tabbar!);
  });

  it('references in chrome CSS are all defined in the scale (no `var(--nt-z-ghost)`)', () => {
    const defined = new Set(
      [...readCss('layering.css').matchAll(/--nt-z-([a-z]+):/g)].map((m) => m[1]),
    );
    for (const file of CSS_FILES) {
      for (const value of zIndexDeclarations(readCss(file))) {
        const m = value.match(/^var\(--nt-z-([a-z]+)\)$/);
        expect(m, `bad reference ${value}`).not.toBeNull();
        expect(defined.has(m![1]!), `--nt-z-${m![1]} is used in ${file} but defined nowhere`).toBe(true);
      }
    }
  });

  it('no layout component sets zIndex inline — positioning belongs to layering.css', () => {
    for (const entry of readdirSync(LAYOUT)) {
      if (!entry.endsWith('.tsx') || entry.includes('.test.')) continue;
      const code = readFileSync(join(LAYOUT, entry), 'utf8');
      expect(code, `${entry} free-styles a z-index`).not.toMatch(/\bzIndex\s*:/);
    }
  });
});

describe('scale.css mirrors the token module', () => {
  const css = readCss('scale.css');

  function varValue(name: string): string {
    const m = css.match(new RegExp(`--nt-${name}:\\s*([^;]+);`));
    expect(m, `--nt-${name} missing from scale.css`).not.toBeNull();
    return m![1]!.trim();
  }

  it('spacing steps match raw.space exactly', () => {
    for (const [step, value] of Object.entries(raw.space)) {
      expect(varValue(`space-${step}`), `space ${step}`).toBe(value);
    }
  });

  it('radius, ink and paper values match raw.color / raw.radius', () => {
    expect(varValue('radius-md')).toBe(raw.radius.md);
    expect(varValue('radius-pill')).toBe(raw.radius.pill);
    expect(varValue('ink-900')).toBe(raw.color.ink900);
    expect(varValue('paper')).toBe(raw.color.paper);
    expect(varValue('accent-600')).toBe(raw.color.accent600);
  });

  it('layout values match the semantic tokens', () => {
    expect(varValue('gutter')).toBe(tokens.layout.gutter);
    expect(varValue('content-max')).toBe(tokens.layout.contentMax);
  });
});

describe('reducedMotionCss replaces the sledgehammer with a scalpel', () => {
  const css = reducedMotionCss();

  it('has the reduce query and zeroes the brand motion tokens', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('--motion-quick: 0ms;');
    expect(css).toContain('--motion-standard: 0ms;');
    expect(css).toContain('--motion-slow: 0ms;');
    expect(css).toContain('--motion-scene: 0ms;');
    expect(css).toContain('--ease-out: linear;');
  });

  it('carries no `!important` — the whole point of the swap', () => {
    expect(css).not.toContain('!important');
  });

  it('does not hide content or kill scroll; kills smooth scroll only', () => {
    expect(css).not.toContain('visibility: hidden');
    expect(css).not.toContain('display: none');
    expect(css).toContain('scroll-behavior: auto');
  });

  it('never blanket-targets `*` like the old rule did', () => {
    expect(css).not.toMatch(/\*\s*\{/);
  });
});

describe('standalone documents obey the token palette', () => {
  const offline = readFileSync(join(PUBLIC_DIR, 'offline.html'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(PUBLIC_DIR, 'manifest.webmanifest'), 'utf8')) as {
    theme_color: string;
    background_color: string;
    start_url: string;
    icons: { src: string }[];
  };

  it('manifest theme/background are the ink and paper tokens, verbatim', () => {
    expect(manifest.theme_color).toBe(raw.color.ink900);
    expect(manifest.background_color).toBe(raw.color.paper);
    expect(manifest.start_url).toBe('/');
  });

  it('every manifest icon exists on disk', () => {
    for (const icon of manifest.icons) {
      expect(readdirSync(join(PUBLIC_DIR, 'icons')), `missing ${icon.src}`).toContain(icon.src.replace('/icons/', ''));
    }
  });

  it('offline.html uses token hexes for ink and paper (no parallel palette)', () => {
    expect(offline).toContain(raw.color.paper);
    expect(offline).toContain(raw.color.ink900);
  });
});

describe('robots.txt keeps the money paths out of crawlers', () => {
  const robots = readFileSync(join(PUBLIC_DIR, 'robots.txt'), 'utf8');
  for (const path of ['/checkout/', '/handover/', '/dispute/', '/sign-in']) {
    expect(robots, `${path} must be disallowed`).toContain(`Disallow: ${path}`);
  }
});
