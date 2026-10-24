import { describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

/**
 * The staff console's own 3D fence.
 *
 * `scripts/check-3d-boundaries.ts` guards the public app's route graph. This app has a different
 * class table — `app | scene | critical` — and exactly one route that may carry the scene runtime:
 * capture QC. Reconciliation, payouts, audit and every ordinary screen must stay out of it, and so
 * must the shell that wraps all of them. The check is a transitive walk, because the dangerous
 * import is never the one in the page file.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url));
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const ROUTER = join(SRC, 'router.tsx');

const SCENE_PACKAGES = ['three', '@react-three', '@nastech/ui-3d'];

type RouteClass = 'app' | 'scene' | 'critical';

interface DeclaredRoute {
  readonly path: string;
  readonly routeClass: RouteClass;
}

interface Edge {
  readonly spec: string;
  readonly dynamic: boolean;
}

function tableBlock(source: string, pattern: RegExp, label: string): string {
  const match = source.match(pattern);
  if (match?.[1] === undefined) throw new Error(`staff fence: could not read ${label} from router.tsx`);
  return match[1];
}

function readDeclaredRoutes(): readonly DeclaredRoute[] {
  const source = readFileSync(ROUTER, 'utf8');
  const table = tableBlock(source, /export const Routes: readonly RouteDef\[\] = \[([\s\S]*?)\n\];/, 'Routes');
  const routes: DeclaredRoute[] = [];
  for (const match of table.matchAll(/path:\s*'([^']+)'[\s\S]*?class:\s*'(app|scene|critical)'/g)) {
    routes.push({ path: match[1]!, routeClass: match[2] as RouteClass });
  }
  return routes;
}

function readPageModules(): ReadonlyMap<string, string> {
  const source = readFileSync(ROUTER, 'utf8');
  const table = tableBlock(
    source,
    /const pages: Record<string, \(\) => Promise<\{ default: Page \}>> = \{([\s\S]*?)\n\};/,
    'pages',
  );
  const pages = new Map<string, string>();
  for (const match of table.matchAll(/'([^']+)':\s*\(\)\s*=>\s*import\('([^']+)'\)/g)) {
    pages.set(match[1]!, match[2]!);
  }
  return pages;
}

/** Every import shape except `import type`, which the transpiler erases. */
function edgesOf(source: string): readonly Edge[] {
  const edges: Edge[] = [];
  for (const match of source.matchAll(/(?:^|[\s;}])(import|export)\s+([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
    const clause = match[2]!.trim();
    if (/^type\b/.test(clause)) continue;
    edges.push({ spec: match[3]!, dynamic: false });
  }
  for (const match of source.matchAll(/(?:^|[\s;}])(?:import)\s*['"]([^'"]+)['"]/g)) {
    edges.push({ spec: match[1]!, dynamic: false });
  }
  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    edges.push({ spec: match[1]!, dynamic: true });
  }
  for (const match of source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    edges.push({ spec: match[1]!, dynamic: false });
  }
  return edges;
}

export function isSceneSpecifier(spec: string): boolean {
  return SCENE_PACKAGES.some((name) => spec === name || spec.startsWith(`${name}/`));
}

function resolveCandidate(base: string): string | null {
  const stripped = base.replace(/\.jsx?$/, '');
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${stripped}.ts`,
    `${stripped}.tsx`,
    `${stripped}/index.ts`,
    `${stripped}/index.tsx`,
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && /\.(ts|tsx|js|jsx)$/.test(candidate)) return candidate;
  }
  return null;
}

function resolveLocal(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  return resolveCandidate(resolve(dirname(fromFile), spec));
}

function resolveWorkspace(spec: string): string | null {
  const match = spec.match(/^@nastech\/([\w-]+)(?:\/(.+))?$/);
  if (match === null) return null;
  const target = join(ROOT, 'packages', match[1]!, 'src', match[2] ?? 'index');
  return resolveCandidate(target);
}

/**
 * Returns every chain from `entry` to a scene-runtime import. The router is a navigation table:
 * its `import()` edges are chunks fetched by a later route change, not bytes the importing page
 * carries, so the walk stops following dynamic edges once it reaches the router. Static edges out
 * of the router are still followed, which catches an eager `import 'three'` there.
 */
export function sceneChains(entry: string, chain: readonly string[] = [relative(ROOT, entry)], seen = new Set<string>(), routerMode = false): readonly string[][] {
  if (seen.has(entry)) return [];
  seen.add(entry);
  const atRouter = routerMode || entry === ROUTER;
  const hits: string[][] = [];
  let source: string;
  try {
    source = readFileSync(entry, 'utf8');
  } catch {
    return hits;
  }
  for (const edge of edgesOf(source)) {
    if (atRouter && edge.dynamic) continue;
    if (isSceneSpecifier(edge.spec)) {
      hits.push([...chain, `${edge.spec}${edge.dynamic ? ' (dynamic)' : ''}`]);
      continue;
    }
    const next = resolveLocal(entry, edge.spec) ?? resolveWorkspace(edge.spec);
    if (next !== null) hits.push(...sceneChains(next, [...chain, relative(ROOT, next)], seen, atRouter));
  }
  return hits;
}

function moduleForLoader(loader: string): string {
  const base = join(SRC, loader.replace(/^\.\//, '').replace(/\.js$/, ''));
  return resolveCandidate(base) ?? base;
}

function sourceFiles(directory: string): readonly string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }) as Dirent[]) {
    if (entry.name === 'tests' || entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe('staff scene-runtime fence', () => {
  const routes = readDeclaredRoutes();
  const pages = readPageModules();
  const governed = routes.filter((route) => route.routeClass !== 'scene');

  it('reads a real route table and a real page map', () => {
    expect(routes.length).toBeGreaterThanOrEqual(16);
    expect(pages.size).toBeGreaterThanOrEqual(16);
    expect(governed.length).toBe(routes.length - 1);
    expect(routes.filter((route) => route.routeClass === 'scene').map((route) => route.path)).toEqual([
      '/listings/:id/capture',
    ]);
    for (const route of governed) expect(pages.has(route.path), `no page module for ${route.path}`).toBe(true);
  });

  it('no app or critical route reaches the scene runtime, transitively', () => {
    const checked: string[] = [];
    const violations: string[] = [];
    for (const route of governed) {
      const loader = pages.get(route.path);
      if (loader === undefined) {
        violations.push(`${route.path}: no page module declared`);
        continue;
      }
      const file = moduleForLoader(loader);
      if (!existsSync(file)) {
        violations.push(`${route.path}: page module missing on disk (${loader})`);
        continue;
      }
      checked.push(file);
      for (const chain of sceneChains(file)) {
        violations.push(`${route.path} [${route.routeClass}] -> ${chain.join(' -> ')}`);
      }
    }
    expect(checked.length).toBe(governed.length);
    expect(violations).toEqual([]);
  });

  it('the shell that wraps every route imports no scene runtime', () => {
    const files = [
      ...sourceFiles(join(SRC, 'layout')),
      ...sourceFiles(join(SRC, 'nav')),
      ...sourceFiles(join(SRC, 'lib')),
      join(SRC, 'bootstrap.ts'),
    ];
    expect(files.length).toBeGreaterThanOrEqual(12);
    const hits: string[] = [];
    for (const file of files) {
      for (const edge of edgesOf(readFileSync(file, 'utf8'))) {
        if (isSceneSpecifier(edge.spec)) hits.push(`${relative(SRC, file)}: ${edge.spec}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('the scanner catches direct, transitive and dynamic injections and leaves a clean control alone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'staff-fence-'));
    try {
      const direct = join(dir, 'direct.tsx');
      const indirect = join(dir, 'indirect.tsx');
      const leaf = join(dir, 'leaf.ts');
      const dynamic = join(dir, 'dynamic.tsx');
      const clean = join(dir, 'clean.tsx');
      const cleanLeaf = join(dir, 'clean-leaf.ts');

      writeFileSync(direct, "import { Canvas } from '@react-three/fiber';\nexport const x = Canvas;\n");
      writeFileSync(indirect, "import { sneaky } from './leaf.js';\nexport const x = sneaky;\n");
      writeFileSync(leaf, "import 'three/examples/jsm/controls/OrbitControls.js';\nexport const sneaky = 1;\n");
      writeFileSync(dynamic, "export const load = () => import('@nastech/ui-3d/scene');\n");
      writeFileSync(clean, "import { helper } from './clean-leaf.js';\nimport { tokens } from '@nastech/design-tokens';\nexport const x = [helper, tokens];\n");
      writeFileSync(cleanLeaf, "export const helper = 1;\n");

      expect(sceneChains(direct).length).toBe(1);
      expect(sceneChains(indirect).length).toBe(1);
      expect(sceneChains(indirect)[0]?.some((part) => part.includes('three/examples'))).toBe(true);
      expect(sceneChains(dynamic).length).toBe(1);
      expect(sceneChains(clean)).toEqual([]);

      // The scanner must agree with the route walk it just performed: a guard that cannot fire is
      // indistinguishable from a clean tree, so prove it fires by name.
      expect(isSceneSpecifier('three')).toBe(true);
      expect(isSceneSpecifier('three/build/three.module.js')).toBe(true);
      expect(isSceneSpecifier('@react-three/drei')).toBe(true);
      expect(isSceneSpecifier('@nastech/ui-3d')).toBe(true);
      expect(isSceneSpecifier('@nastech/ui-3d/fallback')).toBe(true);
      expect(isSceneSpecifier('react')).toBe(false);
      expect(isSceneSpecifier('@nastech/design-tokens')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

});
