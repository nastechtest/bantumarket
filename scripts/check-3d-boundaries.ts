#!/usr/bin/env bun
/**
 * The 3D fence (07 §4.3).
 *
 * One edge, forbidden: no route in a `critical` class — authentication, checkout, PIN, handover,
 * dispute-submit — may reach the WebGL runtime, transitively. And no `first-paint` route may reach
 * it either, because spec §13.4's 170 KB budget is the requirement the 3D programme was forced to
 * honour rather than renegotiate.
 *
 * This is a build-time check on the import graph, not a convention. It mirrors
 * `nastech-market-php/bin/check-boundaries`, which earned the pattern by proving it can be evaded:
 * `--self-test` injects deliberate violations and refuses to report a clean tree unless it detects
 * exactly those. A guard that has never caught anything is indistinguishable from a guard that
 * cannot fire.
 *
 * Run: bun scripts/check-3d-boundaries.ts [--verbose] [--self-test]
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve as rpath, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/**
 * The router is the app's entry, not a page dependency. A route imports it for `useRoute()`, and
 * what that import actually brings is the router's own *static* module graph; its
 * `lazy(() => import(...))` route table is a set of separate chunks fetched by navigation. Charging
 * those chunks to every page that links the router makes /sign-in inherit the scene runtime it never
 * loads — the false positive this rule removes. Static edges out of the router are still followed:
 * an eager `import 'three'` there would ship to every page, which is the failure this fence exists
 * to catch.
 */
const ROUTER_MODULE = `${ROOT}/apps/web-public/src/router.tsx`;

/** Forbidden specifiers: the scene runtime, under any name it can arrive by. */
const SCENE_PACKAGES = ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'];
const SCENE_EDGES = ['@nastech/ui-3d', '@nastech/ui-3d/scene'];
const STATIC_EDGES = ['@nastech/ui-3d/fallback', '@nastech/ui-3d/quality', '@nastech/ui-3d/tokens'];

type RouteClass = 'first-paint' | 'scene' | 'critical' | 'brand';

interface Violation {
  readonly route: string;
  readonly routeClass: RouteClass;
  readonly chain: readonly string[];
  readonly rule: string;
  readonly kind: 'static' | 'dynamic';
}

/** Route table is data, read from the router source so there is exactly one declaration to obey. */
function readRoutes(): Map<string, RouteClass> {
  const src = readFileSync(`${ROOT}/apps/web-public/src/router.tsx`, 'utf8');
  const block = src.match(/export const Routes: readonly RouteDef\[\] = \[([\s\S]*?)\n\];/);
  if (!block) throw new Error('check-3d-boundaries: could not find the Routes table in router.tsx. Update this reader.');
  const table = block[1]!;
  const out = new Map<string, RouteClass>();
  for (const m of table.matchAll(/path:\s*'([^']+)'[\s\S]*?class:\s*'([^']+)'/g)) {
    out.set(m[1]!, m[2] as RouteClass);
  }
  if (out.size === 0) throw new Error('check-3d-boundaries: Routes table parsed but empty.');
  return out;
}

function routeModule(loader: string): string | null {
  // loader is like "./routes/Checkout.js" relative to src/.
  const rel = loader.replace(/^\.\//, '');
  const base = `${ROOT}/apps/web-public/src/${rel}`.replace(/\.js$/, '');
  for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
    if (existsSync(`${base}${ext}`)) return `${base}${ext}`;
  }
  return null;
}

/** Map the declared route paths onto the page loader table in router.tsx. */
function readPageModules(): Map<string, string> {
  const src = readFileSync(`${ROOT}/apps/web-public/src/router.tsx`, 'utf8');
  const block = src.match(/const pages: Record<string, \(\) => Promise<\{ default: Page \}>> = \{([\s\S]*?)\n\};/);
  if (!block) throw new Error('check-3d-boundaries: could not find the pages table in router.tsx.');
  const table = block[1]!;
  const out = new Map<string, string>();
  for (const m of table.matchAll(/'([^']+)':\s*\(\)\s*=>\s*import\('([^']+)'\)/g)) {
    out.set(m[1]!, m[2]!);
  }
  return out;
}

interface Edge {
  readonly spec: string;
  readonly kind: 'static' | 'dynamic';
}

/**
 * The four ways a specifier appears, minus the ones that ship no bytes.
 *
 * `import type` is erased by the transpiler: counting it as an edge makes every route that
 * imports a router type look like it imports the entire route table, which is a false positive so
 * large it would train people to ignore the fence. Dynamic `import()` is kept, but tagged — it is a
 * chunk boundary, and that distinction is what rule 2 turns on.
 *
 * Comments are masked before scanning, for the same credibility reason: this repository writes
 * prose about `three` and about imports inside the headers it uses to explain itself, and a lazy
 * `import\s+[\s\S]*?from` scan happily reads "…the fence's import graph … from 'three'" as a
 * statement. That fabricates edges the bundle does not contain, and — because matches do not
 * overlap — can swallow a real one. A character scan rather than a regex strip, so a `//` inside a
 * URL in a string does not eat the rest of the line.
 */
function maskComments(code: string): string {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const c = code[i]!;
    const next = code[i + 1];
    if (c === '/' && next === '/') {
      while (i < code.length && code[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }
    if (c === '/' && next === '*') {
      for (; i < code.length && !(code[i] === '*' && code[i + 1] === '/'); i++) {
        out += code[i] === '\n' ? '\n' : ' '; // newlines kept so chains and line numbers still mean something
      }
      out += '  ';
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < code.length) {
        const s = code[i]!;
        out += s;
        if (s === '\\') {
          i++;
          if (i < code.length) {
            out += code[i]!;
            i++;
          }
          continue;
        }
        i++;
        if (s === quote) break;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function specifiersOf(code: string): Edge[] {
  const masked = maskComments(code);
  const edges: Edge[] = [];
  const staticRe = /(?:^|[\s;}])(import|export)\s+([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g;
  const bareRe = /(?:^|[\s;}])(?:import)\s*['"]([^'"]+)['"]/g;
  const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const reqRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const m of masked.matchAll(staticRe)) {
    const clause = m[2]!.trim();
    if (/^type\b/.test(clause)) continue; // `import type { X } from '...'` ships no bytes
    edges.push({ spec: m[3]!, kind: 'static' });
  }
  for (const m of masked.matchAll(bareRe)) edges.push({ spec: m[1]!, kind: 'static' });
  for (const m of masked.matchAll(dynRe)) edges.push({ spec: m[1]!, kind: 'dynamic' });
  for (const m of masked.matchAll(reqRe)) edges.push({ spec: m[1]!, kind: 'static' });

  // `import('./x.js').then(...)` and `import type { A } from './b'` inside a clause list.
  return edges.filter((e) => !/^@types\//.test(e.spec));
}

function resolveLocal(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = rpath(dirname(fromFile), spec);
  // TS-with-ESM writes `./leaf.js` for a file named `leaf.ts`. A resolver that only tries
  // `${base}.ts` misses every transitive edge in this repo — the self-test found that by
  // failing to see an injection it was built to catch.
  const stripped = base.replace(/\.jsx?$/, '');
  const candidates = [
    base,
    `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`,
    `${stripped}.ts`, `${stripped}.tsx`,
    `${stripped}/index.ts`, `${stripped}/index.tsx`,
  ];
  for (const c of candidates) if (existsSync(c) && /\.(ts|tsx|js|jsx)$/.test(c)) return c;
  return null;
}

/** Workspace subpath: @nastech/ui-3d/fallback -> packages/ui-3d/src/fallback/index.ts */
function resolveWorkspace(fromFile: string, spec: string): string | null {
  const m = spec.match(/^@nastech\/([\w-]+)(?:\/(.+))?$/);
  if (!m) return null;
  const pkgDir = `${ROOT}/packages/${m[1]}`;
  if (!existsSync(pkgDir)) return null;
  const sub = m[2];
  const target = sub ? `${pkgDir}/src/${sub}` : `${pkgDir}/src/index`;
  const stripped = target.replace(/\.jsx?$/, '');
  for (const ext of ['.ts', '.tsx', '.js']) {
    if (existsSync(`${target}${ext}`)) return `${target}${ext}`;
    if (existsSync(`${stripped}${ext}`)) return `${stripped}${ext}`;
  }
  for (const ext of ['.ts', '.tsx']) {
    const f = `${stripped}/index${ext}`;
    if (existsSync(f)) return f;
  }
  return null;
}

function edgeClass(spec: string): 'scene' | 'static' | 'other' {
  if (SCENE_PACKAGES.includes(spec) || SCENE_PACKAGES.some((p) => spec.startsWith(`${p}/`))) return 'scene';
  if (SCENE_EDGES.includes(spec)) return 'scene';
  if (STATIC_EDGES.includes(spec)) return 'static';
  if (spec === '@nastech/ui-3d' || spec.startsWith('@nastech/ui-3d/')) return spec.startsWith('@nastech/ui-3d/fallback') || spec.startsWith('@nastech/ui-3d/quality') || spec.startsWith('@nastech/ui-3d/tokens') ? 'static' : 'scene';
  return 'other';
}

interface Reach {
  readonly chain: readonly string[];
  readonly kind: 'static' | 'dynamic';
}

/**
 * Transitive walk. `seen` is per-walk and the chain is recorded so a violation names the file that
 * pulled the runtime in — "Checkout.tsx reaches three via CanvasHost" is actionable; "index imports
 * three" is not.
 */
function walk(entry: string, chain: string[] = [entry], seen = new Set<string>(), staticOnly = false): Reach[] {
  if (seen.has(entry)) return [];
  seen.add(entry);
  const hits: Reach[] = [];
  let code: string;
  try {
    code = readFileSync(entry, 'utf8');
  } catch {
    return hits;
  }
  for (const edge of specifiersOf(code)) {
    if (staticOnly && edge.kind === 'dynamic') continue;
    if (edgeClass(edge.spec) === 'scene') {
      hits.push({ chain: [...chain, `${edge.spec}${edge.kind === 'dynamic' ? ' (dynamic)' : ''}`], kind: edge.kind });
      continue;
    }
    const next = resolveLocal(entry, edge.spec) ?? resolveWorkspace(entry, edge.spec);
    if (next) hits.push(...walk(next, [...chain, relative(ROOT, next)], seen, next === ROUTER_MODULE));
  }
  return hits;
}

/**
 * The one check, used by the real run and by the self-test alike.
 *
 * Rule 1 (critical): no reach at all, static or lazy. You never render a scene on a PIN screen, so
 * even a deferred chunk is a dependency you have no reason to carry there.
 * Rule 2 (first-paint): no *static* reach. A dynamic import is a separate chunk fetched on tap,
 * which is precisely how the item page keeps its 170 KB; the payload script counts what that chunk
 * costs, the fence does not forbid it.
 */
function checkModule(file: string, routeClass: RouteClass, route: string): Violation[] {
  const forbidden = (r: Reach) => (routeClass === 'critical' ? true : r.kind === 'static');
  return walk(file)
    .filter(forbidden)
    .map((r) => ({
      route,
      routeClass,
      chain: r.chain,
      kind: r.kind,
      rule:
        routeClass === 'critical'
          ? 'a critical route reaches the WebGL runtime'
          : 'a first-paint route reaches the WebGL runtime in its own chunk and breaks the 170 KB budget',
    }));
}

function check(): Violation[] {
  const classes = readRoutes();
  const pages = readPageModules();
  const violations: Violation[] = [];

  for (const [path, routeClass] of classes) {
    if (routeClass !== 'critical' && routeClass !== 'first-paint') continue;
    const loader = pages.get(path);
    if (!loader) {
      violations.push({ route: path, routeClass, chain: [], rule: 'no page module declared for a fence-governed route', kind: 'static' });
      continue;
    }
    const file = routeModule(loader);
    if (!file) {
      violations.push({ route: path, routeClass, chain: [loader], rule: 'route module missing on disk', kind: 'static' });
      continue;
    }
    violations.push(...checkModule(file, routeClass, path));
  }
  return violations;
}

function report(violations: Violation[], verbose: boolean) {
  const classes = readRoutes();
  if (verbose) {
    console.log(`Routes governed: ${[...classes.entries()].map(([p, c]) => `${p} (${c})`).join(', ')}`);
  }
  if (violations.length === 0) {
    console.log(`OK — ${classes.size} routes, no scene runtime reachable from critical or first-paint.`);
    return;
  }
  console.error(`FAIL — ${violations.length} fence violation(s):`);
  for (const v of violations) {
    console.error(`\n  ${v.route}  [${v.routeClass}/${v.kind}]  ${v.rule}`);
    if (v.chain.length) console.error(`    ${v.chain.join('\n    -> ')}`);
  }
}

/**
 * Self-test. Three throwaway modules, one check function:
 *   A. a "critical" route importing the scene runtime directly — must be caught;
 *   B. a "first-paint" route reaching `three` through a local leaf, i.e. transitively — must be caught;
 *   C. a control that looks clean and is clean — must NOT be flagged, which is what stops the test
 *      passing because the checker flags everything.
 * Then the real tree is checked and must be clean with the injections gone.
 */
async function selfTest(): Promise<number> {
  const { writeFileSync, mkdirSync, rmSync } = await import('node:fs');
  const dir = `${ROOT}/apps/web-public/src/routes`;
  const lib = `${ROOT}/apps/web-public/src/lib`;
  mkdirSync(lib, { recursive: true });

  const A = `${dir}/__fence_selftest_direct.tsx`;
  const B = `${dir}/__fence_selftest_indirect.tsx`;
  const C = `${dir}/__fence_selftest_control.tsx`;
  const leaf = `${lib}/__fence_selftest_leaf.ts`;

  writeFileSync(A, "import { CanvasHost } from '@nastech/ui-3d/scene';\nexport default function X(){ return void CanvasHost }\n");
  writeFileSync(B, "import { sneaky } from '../lib/__fence_selftest_leaf.js';\nexport default function Y(){ return sneaky() }\n");
  writeFileSync(C, "import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';\nimport { PosterFallback } from '@nastech/ui-3d/fallback';\nexport default function Z(){ return void [CLAIM_SCOPE_DISCLOSURE, PosterFallback] }\n");
  writeFileSync(leaf, "import * as THREE from 'three';\nexport function sneaky(){ return THREE.REVISION }\n");

  const a = checkModule(A, 'critical', '/__selftest_direct');
  const b = checkModule(B, 'first-paint', '/__selftest_indirect');
  const c = checkModule(C, 'critical', '/__selftest_control');
  // D. the shape the design depends on and rule 2 must allow: an item page that reaches the scene
  //    only through a deferred import. If this is flagged, the fence forbids the architecture.
  const D = `${dir}/__fence_selftest_lazy.tsx`;
  writeFileSync(D, "export default function L(){ return import('@nastech/ui-3d/scene').then(() => null) }\n");
  const d = checkModule(D, 'first-paint', '/__selftest_lazy');
  rmSync(D, { force: true });
  // E. a critical route that links the router for `useRoute()` and must NOT inherit the route
  //    table's lazy chunks. This is the shape that made /sign-in look like it reached the scene:
  //    the router's `lazy(() => import('./routes/Home.js'))` is navigation, not a dependency.
  const E = `${dir}/__fence_selftest_router_consumer.tsx`;
  writeFileSync(E, "import { useRoute } from '../router.js';\nexport default function R(){ return useRoute().path }\n");
  const e = checkModule(E, 'critical', '/__selftest_router_consumer');
  rmSync(E, { force: true });
  // F. prose that looks like an import. Every header in this repo explains itself with the words
  //    "import" and "three" in the same sentence; if a comment can raise a violation, the fence is
  //    a noise machine and people start adding exemptions to it. The masking must not cost sight
  //    either — the real clean import below still resolves.
  const F = `${dir}/__fence_selftest_prose.tsx`;
  writeFileSync(
    F,
    "/**\n * The import graph here must never reach three or @react-three/fiber,\n * see notes about `import { Canvas } from 'three'` below.\n */\n// import { Vector3 } from 'three'; was removed\nimport { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';\nexport default function P(){ return void CLAIM_SCOPE_DISCLOSURE }\n",
  );
  const f = checkModule(F, 'critical', '/__selftest_prose');
  rmSync(F, { force: true });
  const tree = check();

  for (const p of [A, B, C, leaf]) rmSync(p, { force: true });

  const failures: string[] = [];
  if (a.length !== 1) failures.push(`injection A (direct scene import on a critical route): expected 1 violation, got ${a.length}`);
  if (b.length !== 1) failures.push(`injection B (transitive three on a first-paint route): expected 1 violation, got ${b.length}`);
  if (c.length !== 0) failures.push(`control C (clean static-path import): expected 0 violations, got ${c.length}`);
  if (d.length !== 0) failures.push(`control D (deferred scene chunk on a first-paint route): expected 0 violations, got ${d.length} — rule 2 is forbidding the lazy load the design is built on`);
  if (e.length !== 0) failures.push(`control E (critical route importing the router): expected 0 violations, got ${e.length} — the router's lazy route table is being charged to every page that links the router`);
  if (f.length !== 0) failures.push(`control F (comment prose naming three): expected 0 violations, got ${f.length} — prose is being scanned as code: ${f[0]?.chain.join(' -> ')}`);
  if (tree.length !== 0) failures.push(`real tree with injections removed: expected 0, got ${tree.length} — the previous run leaked a file, or the fence is now red`);

  if (failures.length === 0) {
    console.log('SELF-TEST OK — 2 injections caught by name, 4 clean controls passed (static-path import, deferred scene chunk, router link, comment prose), real tree clean.');
    console.log(`  A chain: ${a[0]?.chain.join(' -> ')}`);
    console.log(`  B chain: ${b[0]?.chain.join(' -> ')}`);
    return 0;
  }
  console.error('SELF-TEST FAILED — this fence does not see what it claims to prevent:');
  for (const f of failures) console.error(`  · ${f}`);
  return 1;
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) {
  // For the self-test to see its own injections, run the check once with them on disk first.
  const code = await selfTest();
  process.exit(code);
}
report(check(), args.includes('--verbose'));
