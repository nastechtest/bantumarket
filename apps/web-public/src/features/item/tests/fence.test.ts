import { describe, it, expect } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The fence, local (wave-B brief 12: this test checks all four import shapes, copying the
 * technique from packages/design-system/src/tests/forbidden-imports.test.ts).
 *
 * `scripts/check-3d-boundaries.ts` guards the *route graph*; this guards *this directory and its
 * route shell* at the file level, so the edit that breaks the 170 KB first-paint budget breaks a
 * fast local test before it breaks the slow build. Forbidden specifiers: `three`, `@react-three/*`
 * and *all of* `@nastech/ui-3d` — including `/fallback`. The item page must not import the
 * fallback components because on THIS page the photographs are the product, not a degraded mode
 * of something else; the fallback surfaces belong to the inspect route (brief 13).
 *
 * The scan excludes `tests/**` (this file legitimately contains forbidden strings as injected
 * test material) and `node_modules`. It includes `routes/ItemPage.tsx`, the re-export shell that
 * is this feature's router-visible face.
 */

const FEATURE_SRC = new URL('.', import.meta.url).pathname.replace(/tests\/$/, '');
const ROUTE_SHELL = join(FEATURE_SRC, '..', '..', 'routes', 'ItemPage.tsx');

const FORBIDDEN_PREFIXES = ['@nastech/ui-3d', 'three', '@react-three'];

function isForbidden(spec: string): boolean {
  return FORBIDDEN_PREFIXES.some((p) => spec === p || spec.startsWith(`${p}/`));
}

/** The four shapes: static `import … from`, bare `import 'x'`, dynamic `import('x')`, `require('x')`. */
function specifiersOf(code: string): string[] {
  const specs: string[] = [];
  for (const m of code.matchAll(/(?:^|[\s;}])(?:import|export)\s+[\s\S]*?\s*from\s*['"]([^'"]+)['"]/g)) specs.push(m[1]!);
  for (const m of code.matchAll(/(?:^|[\s;})]?)import\s*['"]([^'"]+)['"]/g)) specs.push(m[1]!);
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1]!);
  for (const m of code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1]!);
  return specs;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'tests' || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('item-page 3D fence', () => {
  const files = [...sourceFiles(FEATURE_SRC), ROUTE_SHELL];

  it('scans the real surface: every implementation file plus the route shell', () => {
    expect(files.length).toBeGreaterThanOrEqual(24);
    expect(files.some((f) => f.endsWith('item-page.tsx'))).toBe(true);
    expect(files.some((f) => f.endsWith(join('media', 'gallery.tsx')))).toBe(true);
    expect(files.some((f) => f.endsWith('ItemPage.tsx') && f.includes('routes'))).toBe(true);
  });

  it('no item-page file reaches the scene runtime by static, bare, dynamic or require import', () => {
    for (const file of files) {
      const hits = specifiersOf(readFileSync(file, 'utf8')).filter(isForbidden);
      expect(hits, `${file} imports the scene runtime: ${hits.join(', ')}`).toEqual([]);
    }
  });

  it('the scanner fires on injected violations in all four shapes', () => {
    const injections = [
      `import { CanvasHost } from '@nastech/ui-3d/scene';`,
      `import { TurntableSprite } from '@nastech/ui-3d/fallback';`,
      `export { PosterFallback } from '@nastech/ui-3d';`,
      `const THREE = require('three');`,
      `const load = () => import('@react-three/fiber');`,
      `import 'three/examples/jsm/controls/OrbitControls';`,
    ];
    for (const code of injections) {
      expect(specifiersOf(code).some(isForbidden), `missed: ${code}`).toBe(true);
    }
    // Control: clean code must not be flagged, or the scanner "passes" by flagging everything.
    expect(
      specifiersOf(`import { tokens } from '@nastech/design-tokens';\nimport { money } from '@nastech/api-contracts';`).some(isForbidden),
    ).toBe(false);
    expect(specifiersOf(`import { useState } from 'react';`).some(isForbidden)).toBe(false);
    // The word "3D" in ordinary UI copy must not trip it — only real specifiers do.
    expect(specifiersOf(`const marker = '3D inspected';\nconst href = '/item/x/inspect';`).some(isForbidden)).toBe(false);
  });

  it('the route shell is a re-export of the feature and carries no other specifier', () => {
    const shell = readFileSync(ROUTE_SHELL, 'utf8');
    const specs = specifiersOf(shell);
    expect(specs, `route shell grew: ${specs.join(', ')}`).toEqual(['../features/item/index.js']);
  });
});
