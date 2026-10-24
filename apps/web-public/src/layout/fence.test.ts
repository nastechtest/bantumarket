import { describe, it, expect } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The first-paint fence, local (technique copied from
 * `packages/design-system/src/tests/forbidden-imports.test.ts` per the brief).
 *
 * `scripts/check-3d-boundaries.ts` guards the *route graph*, but layout/bootstrap/lib/styles are
 * the shell every first-paint route wears: if a later edit pulls `@nastech/ui-3d`, `three` or
 * `@react-three/*` into the chrome, the 170 KB budget (`budgets.firstPaintJsKb`) breaks at the
 * app edge and the route-level failure is confusing. This asserts the rule over the files
 * themselves so the edit that breaks the budget breaks a test here first.
 *
 * Part two is the same budget's CSS face: no `@import` (a chain of render-blocking stylesheets),
 * no remote font URLs, no icon fonts, and every `@font-face` must carry `font-display: optional`.
 */

const SRC = new URL('..', import.meta.url).pathname; // apps/web-public/src

const FORBIDDEN_PREFIXES = ['@nastech/ui-3d', 'three', '@react-three'];
const SCANNED_DIRS = ['layout', 'bootstrap', 'lib', 'styles'];

function isForbidden(spec: string): boolean {
  return FORBIDDEN_PREFIXES.some((p) => spec === p || spec.startsWith(`${p}/`));
}

/** Same four shapes the root fence reads: static, bare, dynamic, require. */
function specifiersOf(code: string): string[] {
  const specs: string[] = [];
  for (const m of code.matchAll(/(?:^|[\s;}])(?:import|export)\s+[\s\S]*?\s*from\s*['"]([^'"]+)['"]/g)) specs.push(m[1]!);
  for (const m of code.matchAll(/(?:^|[\s;})]?)import\s*['"]([^'"]+)['"]/g)) specs.push(m[1]!);
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1]!);
  for (const m of code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1]!);
  return specs;
}

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Test files are never bundled and legitimately quote the forbidden specifiers (this file
    // included), so they are out of scan scope — same exclusion design-system makes for `tests/`.
    if (entry.name.includes('.test.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.css'))
    .map((f) => join(dir, f));
}

/** The CSS budget scan, as a function so the self-test can feed it injections. */
function cssBudgetViolations(css: string): string[] {
  const bad: string[] = [];
  if (/^\s*@import\s/m.test(css)) bad.push('@import chain (render-blocking stylesheet request)');
  if (/url\(\s*['"]?(https?:)?\/\//.test(css)) bad.push('remote url() — nothing in chrome CSS may fetch cross-origin');
  const faceRe = /@font-face\s*\{[^}]*\}/g;
  for (const face of css.matchAll(faceRe)) {
    if (!/font-display:\s*optional/.test(face[0]!)) bad.push('@font-face without font-display: optional');
  }
  if (/font-family:[^;}]*icon/i.test(css)) bad.push('icon font — glyphs are inline SVG (layout/icons.tsx)');
  return bad;
}

describe('app-shell first-paint fence', () => {
  const files = SCANNED_DIRS.flatMap((d) => tsFiles(join(SRC, d)));
  const css = SCANNED_DIRS.flatMap((d) => cssFiles(join(SRC, d)));

  it('scans the whole shell, not an empty set', () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
    expect(css.length).toBeGreaterThanOrEqual(7);
    expect(files.some((f) => f.endsWith('header.tsx'))).toBe(true);
  });

  it('no shell file reaches the scene runtime by any import shape', () => {
    for (const file of files) {
      const hits = specifiersOf(readFileSync(file, 'utf8')).filter(isForbidden);
      expect(hits, `${file} imports the scene runtime: ${hits.join(', ')}`).toEqual([]);
    }
  });

  it('no shell CSS pays the first paint a blocking request', () => {
    for (const file of css) {
      const violations = cssBudgetViolations(readFileSync(file, 'utf8'));
      expect(violations, `${file}: ${violations.join('; ')}`).toEqual([]);
    }
  });

  it('the scanner fires on injected violations — a guard that never caught anything proves nothing', () => {
    const jsInjections = [
      `import { CanvasHost } from '@nastech/ui-3d/scene';`,
      `export { PosterFallback } from '@nastech/ui-3d';`,
      `const THREE = require('three');`,
      `const load = () => import('@react-three/fiber');`,
      `import 'three/examples/jsm/controls/OrbitControls';`,
    ];
    for (const code of jsInjections) {
      expect(specifiersOf(code).some(isForbidden), `missed JS: ${code}`).toBe(true);
    }

    const cssInjections = [
      `@import url("https://fonts.example.com/x.css");`,
      `@font-face { font-family: "Brand"; src: url("/fonts/brand.woff2"); }`,
      `body { background: url("https://cdn.example.com/tile.png"); }`,
      `.icon::before { font-family: "NasIcons"; content: "\\e901"; }`,
    ];
    for (const code of cssInjections) {
      expect(cssBudgetViolations(code).length, `missed CSS: ${code}`).toBeGreaterThan(0);
    }

    // Controls: clean code must not be flagged, or the scanner "passes" by flagging everything.
    expect(specifiersOf(`import { tokens } from '@nastech/design-tokens';\nimport { budgets } from '@nastech/api-contracts';`).some(isForbidden)).toBe(false);
    expect(cssBudgetViolations(`@font-face { font-family: "Brand"; src: url("/fonts/brand.woff2") format("woff2"); font-display: optional; }`).length).toBe(0);
    expect(cssBudgetViolations(`.x { background: url("/icons/icon.svg"); }`).length).toBe(0);
  });
});
