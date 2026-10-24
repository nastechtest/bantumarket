import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';

/**
 * Payload structure, not bytes.
 *
 * The brief is explicit: `payload.test.ts` must NOT run a build (14 other agents share this tree, and
 * byte measurement belongs to the controller's `check-payload-budget.ts`). Instead this test asserts
 * the *shape* that makes the budgets satisfiable: the scene runtime is reachable from the inspect
 * surface only through a dynamic `import()` boundary, and never statically from the item page or the
 * brand route — which is precisely how the item page keeps its 170 KB and home keeps its 220 KB. The
 * fence (`scripts/check-3d-boundaries.ts`) enforces the same thing across the whole graph; this test
 * guards the specific decision that belongs to brief-13.
 */

const SRC = new URL('../..', import.meta.url).pathname.replace(/\/$/, ''); // apps/web-public/src

const SCENE_EDGE = (spec: string): boolean =>
  ['@nastech/ui-3d', '@nastech/ui-3d/scene', 'three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'].includes(spec) ||
  (spec.startsWith('@nastech/ui-3d/') && !/^@nastech\/ui-3d\/(fallback|quality|tokens)/.test(spec));

/** Strip comments: the fence walks the real module graph, so prose must never count as an edge. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*$/gm, '');
}

/** Mirror the fence's specifier extraction: static edges minus `import type`, plus dynamic `import()`. */
function edges(code: string): { static: string[]; dynamic: string[] } {
  const src = stripComments(code);
  const stat: string[] = [];
  const dyn: string[] = [];
  const staticRe = /(?:^|[\s;}])(import|export)\s+([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(staticRe)) {
    if (/^type\b/.test(m[2]!.trim())) continue;
    stat.push(m[3]!);
  }
  for (const m of src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) dyn.push(m[1]!);
  return { static: stat, dynamic: dyn };
}

const read = (rel: string) => readFileSync(`${SRC}/${rel}`, 'utf8');

describe('payload structure — the scene is opt-in by navigation, never by an item-page import', () => {
  it('the router gives the inspect route its own lazily-imported chunk in the scene class', () => {
    const router = read('router.tsx');
    expect(router).toMatch(/path:\s*'\/item\/:id\/inspect'[\s\S]*?class:\s*'scene'/);
    expect(router).toContain("import('./routes/Inspect.js')");
  });

  it('inspect-page reaches the scene subtree ONLY through a dynamic import', () => {
    const e = edges(read('features/inspect/inspect-page.tsx'));
    expect(e.dynamic).toContain('./scene-mount.js');
    expect(e.static.filter(SCENE_EDGE)).toEqual([]);
  });

  it('the inspect route shell pulls no scene runtime statically either', () => {
    const e = edges(read('routes/Inspect.tsx'));
    expect(e.static.filter(SCENE_EDGE)).toEqual([]);
  });

  it('scene-mount is the one place the WebGL runtime is imported, and it is behind the boundary', () => {
    const e = edges(read('features/inspect/scene-mount.tsx'));
    // It is the lazy chunk, so a static scene edge here is expected and correct.
    expect(e.static).toContain('@nastech/ui-3d/scene');
    // And it is only ever loaded by inspect-page's dynamic import — nothing else names it.
    // inspect-page is checked separately below: it is the ONE module allowed to name scene-mount,
    // and it must do so only through `import()`, never a static edge.
    const others = [
      'features/inspect/index.ts',
      'routes/Inspect.tsx',
      'routes/Home.tsx',
      'features/brand/hero-scene.tsx',
      'features/brand/index.ts',
    ];
    for (const f of others) {
      expect(edges(read(f)).static).not.toContain('./scene-mount.js');
      expect(edges(read(f)).dynamic).not.toContain('./scene-mount.js');
    }
    // The permitted edge is dynamic, and inspect-page has no static scene edge into it.
    expect(read('features/inspect/inspect-page.tsx')).toContain("import('./scene-mount.js')");
    expect(edges(read('features/inspect/inspect-page.tsx')).static).not.toContain('./scene-mount.js');
  });

  it('the brand surfaces never import the scene runtime statically (home stays a first-paint-scale chunk)', () => {
    for (const f of ['routes/Home.tsx', 'features/brand/hero-poster.tsx', 'features/brand/category-transition.tsx', 'features/brand/still-frame.tsx']) {
      expect(edges(read(f)).static.filter(SCENE_EDGE)).toEqual([]);
    }
    // The hero scene may reach the runtime, but only dynamically, and its package import is type-only.
    const hero = edges(read('features/brand/hero-scene.tsx'));
    expect(hero.static.filter(SCENE_EDGE)).toEqual([]);
    expect(hero.dynamic).toContain('@nastech/ui-3d/scene');
    expect(hero.dynamic).toContain('../../scenes/PilotWatch.js');
  });

  it('no brand or inspect-page module imports the barrels that defeat chunking', () => {
    // A bare `@nastech/ui-3d` (root barrel) re-exports the scene runtime — the anti-pattern the brief
    // calls out. Every consumer here must use a subpath (/scene, /fallback, /quality, /tokens).
    for (const f of ['routes/Home.tsx', 'routes/Inspect.tsx', 'features/inspect/inspect-page.tsx', 'features/brand/hero-scene.tsx', 'features/brand/hero-poster.tsx']) {
      expect(edges(read(f)).static).not.toContain('@nastech/ui-3d');
    }
  });
});
