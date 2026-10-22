import { describe, it, expect } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The fence, local. `scripts/check-3d-boundaries.ts` guards the route graph, but this package
 * sits on the first-paint path of every route: if a later edit pulls `@nastech/ui-3d`, `three`
 * or `@react-three/*` into design-system source, the 170 KB budget breaks at the app edge and
 * the route-level failure is confusing. This asserts the rule over the files themselves, so the
 * edit that breaks the budget breaks a test here first.
 */

const SRC = new URL('..', import.meta.url).pathname;

const FORBIDDEN_PREFIXES = ['@nastech/ui-3d', 'three', '@react-three'];

function isForbidden(spec: string): boolean {
  return FORBIDDEN_PREFIXES.some((p) => spec === p || spec.startsWith(`${p}/`));
}

/** Same four shapes the root fence reads: static, bare, dynamic, require. */
function specifiersOf(code: string): string[] {
  const specs: string[] = [];
  for (const m of code.matchAll(/(?:^|[\s;}])(?:import|export)\s+[\s\S]*?\s*from\s*['"]([^'"]+)['"]/g)) specs.push(m[1]!);
  for (const m of code.matchAll(/(?:^|[\s;})]?)import\s*['"]([^'"]+)['"]/g)) specs.push(m[1]!);
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1]!);
  for (const m of code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\)/g)) specs.push(m[1]!);
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

describe('design-system import fence', () => {
  const files = sourceFiles(SRC);

  it('scans the whole package, not an empty set', () => {
    expect(files.length).toBeGreaterThanOrEqual(13);
    expect(files.some((f) => f.endsWith('index.ts'))).toBe(true);
  });

  it('no source file reaches the scene runtime by any import shape', () => {
    for (const file of files) {
      const hits = specifiersOf(readFileSync(file, 'utf8')).filter(isForbidden);
      expect(hits, `${file} imports the scene runtime: ${hits.join(', ')}`).toEqual([]);
    }
  });

  it('the scanner fires on injected violations — a guard that never caught anything proves nothing', () => {
    const injections = [
      `import { CanvasHost } from '@nastech/ui-3d/scene';`,
      `export { PosterFallback } from '@nastech/ui-3d';`,
      `const THREE = require('three');`,
      `const load = () => import('@react-three/fiber');`,
      `import 'three/examples/jsm/controls/OrbitControls';`,
    ];
    for (const code of injections) {
      expect(specifiersOf(code).some(isForbidden), `missed: ${code}`).toBe(true);
    }
    // Control: clean code must not be flagged, or the scanner "passes" by flagging everything.
    expect(specifiersOf(`import { tokens } from '@nastech/design-tokens';\nimport { money } from '@nastech/api-contracts';`).some(isForbidden)).toBe(false);
    expect(specifiersOf(`import { useState } from 'react';`).some(isForbidden)).toBe(false);
  });
});
