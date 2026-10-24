/**
 * The brand set is generated, so the tests assert the contract the HTML depends on: the manifest
 * parses, every referenced file exists, and the social card actually states the fees. Reading the
 * built files (not the generator's templates) is the point — a rename that skips one app fails here.
 */
import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { raw } from '@nastech/design-tokens';

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));
const indexPath = fileURLToPath(new URL('../../index.html', import.meta.url));

interface ManifestIcon {
  readonly src?: unknown;
  readonly sizes?: unknown;
  readonly type?: unknown;
}

interface Manifest {
  readonly name?: unknown;
  readonly short_name?: unknown;
  readonly theme_color?: unknown;
  readonly display?: unknown;
  readonly icons?: unknown;
}

function readPublic(name: string): string {
  return readFileSync(new URL(`../../public/${name}`, import.meta.url), 'utf8');
}

describe('brand assets', () => {
  it('ships a valid installable manifest with token theme colour', () => {
    const manifest = JSON.parse(readPublic('site.webmanifest')) as Manifest;
    expect(manifest.name).toBe('Bantu Market Ops');
    expect(manifest.short_name).toBe('Bantu Ops');
    expect(manifest.theme_color).toBe(raw.color.ink900);
    expect(manifest.display).toBe('standalone');
    expect(Array.isArray(manifest.icons)).toBe(true);
    const icons = (manifest.icons ?? []) as readonly ManifestIcon[];
    expect(icons.length).toBeGreaterThanOrEqual(3);
    for (const icon of icons) {
      expect(typeof icon.src).toBe('string');
      expect(typeof icon.sizes).toBe('string');
      expect(typeof icon.type).toBe('string');
      if (typeof icon.src === 'string') {
        expect(icon.src.startsWith('./')).toBe(true);
        expect(existsSync(`${publicDir}${icon.src.slice(2)}`)).toBe(true);
      }
    }
  });

  it('references only assets that exist, from relative URLs', () => {
    const html = readFileSync(indexPath, 'utf8');
    const refs = [...html.matchAll(/(?:href|src|content)=["'](\.\/[^"']+)["']/g)]
      .map((match) => match[1])
      .filter((value): value is string => value !== undefined);
    expect(refs.length).toBeGreaterThanOrEqual(5);
    for (const ref of new Set(refs)) {
      expect(ref.startsWith('./')).toBe(true);
      const file = ref.slice(2).split(/[?#]/)[0];
      expect(file === undefined ? false : existsSync(`${publicDir}${file}`)).toBe(true);
    }
    expect(html).not.toMatch(/(?:href|content)="\/(?:favicon|apple-touch-icon|site\.webmanifest|og\.)/);
  });

  it('states the wordmark, the promise and the fees on the social card', () => {
    const og = readPublic('og.svg');
    expect(og).toContain('Bantu Market');
    expect(og).toContain('Second-hand, inspected');
    for (const figure of ['R0', '10%', 'R270']) expect(og).toContain(figure);
    expect(og).toContain('width="1200"');
    expect(og).toContain('height="630"');
  });

  it('ships an icon sprite that inherits currentColor', () => {
    const sprite = readPublic('icons.svg');
    const symbols = [...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1]);
    expect(symbols.length).toBeGreaterThanOrEqual(12);
    for (const id of ['search', 'camera', 'chevron', 'shield', 'truck', 'wallet', 'message', 'flag', 'check', 'alert', 'spinner', 'close']) {
      expect(symbols).toContain(id);
    }
    expect(sprite).toContain('stroke="currentColor"');
  });

  it('ships the raster fallbacks, including a 180px apple touch icon', () => {
    for (const name of ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'og.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png']) {
      expect(existsSync(`${publicDir}${name}`)).toBe(true);
    }
    const png = readFileSync(`${publicDir}apple-touch-icon.png`);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.readUInt32BE(16)).toBe(180);
    expect(png.readUInt32BE(20)).toBe(180);
  });
});
