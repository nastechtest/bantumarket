import { describe, it, expect } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve as rpath, relative } from 'node:path';

/**
 * The fence, at the feature edge. `scripts/check-3d-boundaries.ts` guards the ROUTE graph, but
 * it only sees a feature once the controller wires it into `router.tsx`. Until then — and
 * forever, as a property of this directory — the transitive import closure of `index.ts` must
 * not reach the WebGL runtime. This is a `critical` route class: static AND dynamic reach are
 * both forbidden (a deferred scene chunk on a PIN screen is still a dependency you cannot ship).
 *
 * It is a real graph walk, not a grep of one file: the way an orders screen breaks the rule is
 * by importing a friendly-looking helper that imports `@nastech/ui-3d`.
 */

const FEATURE_ROOT = new URL('..', import.meta.url).pathname; // features/
const ENTRY = `${FEATURE_ROOT}orders/index.ts`;

const SCENE_PACKAGES = ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'];
const SCENE_EDGES = ['@nastech/ui-3d', '@nastech/ui-3d/scene', '@nastech/ui-3d/controls', '@nastech/ui-3d/loading', '@nastech/ui-3d/viewer'];

function isSceneEdge(spec: string): boolean {
  if (SCENE_PACKAGES.includes(spec) || SCENE_PACKAGES.some((p) => spec.startsWith(`${p}/`))) return true;
  return spec === '@nastech/ui-3d' || spec.startsWith('@nastech/ui-3d/');
}

function specifiersOf(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/(?:^|[\s;}])(?:import|export)\s+([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
    // `import type` is erased by the transpiler — same rule as the root fence, or every route
    // that takes a RouteDef type would look like it imports the router's whole page table.
    if (/^type\b/.test(m[1]!.trim())) continue;
    out.push(m[2]!);
  }
  for (const m of code.matchAll(/(?:^|[\s;}])(?:import)\s*['"]([^'"]+)['"]/g)) out.push(m[1]!);
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]!);
  for (const m of code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\)/g)) out.push(m[1]!);
  return out;
}

function resolveEdge(fromFile: string, spec: string): string | null {
  if (spec.startsWith('.')) {
    const base = rpath(dirname(fromFile), spec);
    const stripped = base.replace(/\.jsx?$/, '');
    for (const c of [`${stripped}.ts`, `${stripped}.tsx`, base, `${stripped}/index.ts`, `${stripped}/index.tsx`]) {
      if (existsSync(c) && /\.(ts|tsx)$/.test(c)) return c;
    }
    return null;
  }
  const m = spec.match(/^@nastech\/([\w-]+)/);
  if (!m) return null;
  const pkg = `${FEATURE_ROOT.replace(/features\/$/, '')}../packages/${m[1]}/src/index.ts`;
  return existsSync(pkg) ? pkg : null;
}

function walk(file: string, seen = new Set<string>(), chain: string[] = []): string[] {
  if (seen.has(file)) return [];
  seen.add(file);
  let code: string;
  try {
    code = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const hits: string[] = [];
  for (const spec of specifiersOf(code)) {
    if (isSceneEdge(spec)) {
      hits.push([...chain, `${relative(FEATURE_ROOT, file)} → ${spec}`].join(' | '));
      continue;
    }
    const next = resolveEdge(file, spec);
    if (next) hits.push(...walk(next, seen, [...chain, relative(FEATURE_ROOT, file)]));
  }
  return hits;
}

describe('orders: critical-class reachability fence', () => {
  it('the entry module exists and its closure is non-trivial', () => {
    expect(existsSync(ENTRY)).toBe(true);
    const closure = [ENTRY];
    expect(closure.some((f) => existsSync(f))).toBe(true);
  });

  it('the transitive import closure of orders/index.ts never reaches the scene runtime', () => {
    const hits = walk(ENTRY);
    expect(hits, `scene runtime reachable: ${hits.join('\n  ')}`).toEqual([]);
  });

  it('no orders source file names the scene packages at all', () => {
    const files = ['state-labels.ts', 'use-orders.ts', 'orders-list.tsx', 'order-card.tsx', 'order-detail.tsx', 'order-status-track.tsx', 'receipt.tsx', 'cancel-flow.tsx', 'orders-shell.tsx', 'api/orders-transport.ts', 'api/fixtures.ts'];
    for (const f of files) {
      const code = readFileSync(`${FEATURE_ROOT}orders/${f}`, 'utf8');
      const scene = specifiersOf(code).filter(isSceneEdge);
      expect(scene, `orders/${f} imports the scene runtime`).toEqual([]);
    }
  });

  it('the walk fires on an injected scene import — a guard that cannot fire proves nothing', () => {
    const poisoned = `import { CanvasHost } from '@nastech/ui-3d/scene';\nexport default function X(){ return CanvasHost }`;
    expect(specifiersOf(poisoned).some(isSceneEdge)).toBe(true);
    const lazy = `const go = () => import('three');`;
    expect(specifiersOf(lazy).some(isSceneEdge)).toBe(true);
    // Control: a clean critical import must not flag, or the test "passes" by flagging everything.
    expect(specifiersOf(`import { MoneyText } from '@nastech/design-system';`).some(isSceneEdge)).toBe(false);
  });
});

/**
 * The same property over the handover feature and the route file that owns `/handover/:orderId`
 * today — both `critical`. If either closure ever grows a scene edge, this fails before the
 * controller's fence does.
 */
describe('handover: critical-class reachability fence', () => {
  const HANDOVER_ENTRY = `${FEATURE_ROOT}handover/index.ts`;
  const ROUTE_ENTRY = `${FEATURE_ROOT.replace(/features\/$/, '')}routes/Handover.tsx`;

  it('handover/index.ts closure never reaches the scene runtime', () => {
    expect(existsSync(HANDOVER_ENTRY)).toBe(true);
    const hits = walk(HANDOVER_ENTRY, new Set(), []);
    expect(hits, `scene runtime reachable: ${hits.join('\n  ')}`).toEqual([]);
  });

  it('routes/Handover.tsx — the live critical route entry — never reaches it either', () => {
    expect(existsSync(ROUTE_ENTRY)).toBe(true);
    const hits = walk(ROUTE_ENTRY, new Set(), []);
    expect(hits, `scene runtime reachable: ${hits.join('\n  ')}`).toEqual([]);
  });
});
