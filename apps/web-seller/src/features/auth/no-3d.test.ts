import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve as rpath } from 'node:path';

/**
 * `/sign-in` is `critical`: the scene runtime may not be reachable from this feature or from the
 * route module that renders it, statically or lazily. Dynamic reach counts — a deferred chunk on a
 * credential screen is still a dependency you cannot ship.
 */

const HERE = dirname(new URL(import.meta.url).pathname);
const ROUTE = rpath(HERE, '../../routes/SignIn.tsx');
const PACKAGES = rpath(HERE, '../../../../../packages');

const SCENE = ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing', '@nastech/ui-3d'];
const isSceneEdge = (spec: string) => SCENE.some((p) => spec === p || spec.startsWith(`${p}/`));

function specifiersOf(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/(?:^|[\s;}])(?:import|export)\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    if (/^type\b/.test(m[1]!.trim())) continue;
    out.push(m[2]!);
  }
  for (const m of code.matchAll(/(?:^|[\s;}])(?:import)\s*['"]([^'"]+)['"]/g)) out.push(m[1]!);
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]!);
  for (const m of code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\)/g)) out.push(m[1]!);
  return out;
}

function resolveLocal(from: string, spec: string): string | null {
  const base = rpath(dirname(from), spec).replace(/\.jsx?$/, '');
  for (const c of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) if (existsSync(c)) return c;
  return null;
}
function resolvePkg(spec: string): string | null {
  const m = spec.match(/^@nastech\/([\w-]+)/);
  if (m === null) return null;
  const entry = `${PACKAGES}/${m[1]}/src/index.ts`;
  return existsSync(entry) ? entry : null;
}
function walk(file: string, seen = new Set<string>()): string[] {
  if (seen.has(file) || !/\.(ts|tsx)$/.test(file)) return [];
  seen.add(file);
  const hits: string[] = [];
  for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
    if (isSceneEdge(spec)) {
      hits.push(`${relative(HERE, file)} → ${spec}`);
      continue;
    }
    const next = spec.startsWith('.') ? resolveLocal(file, spec) : resolvePkg(spec);
    if (next !== null) hits.push(...walk(next, seen));
  }
  return hits;
}

describe('auth: critical-class reachability fence', () => {
  it('walks index.ts and the sign-in route module', () => {
    expect(existsSync(`${HERE}/index.ts`)).toBe(true);
    expect(existsSync(ROUTE)).toBe(true);
  });

  it('neither closure reaches the scene runtime', () => {
    const hits = [...walk(`${HERE}/index.ts`), ...walk(ROUTE)];
    expect(hits, `scene runtime reachable:\n${hits.join('\n')}`).toEqual([]);
  });

  it('the scanner fires on static, dynamic and require shapes', () => {
    expect(specifiersOf(`import { SceneHost } from '@nastech/ui-3d';`).some(isSceneEdge)).toBe(true);
    expect(specifiersOf(`const x = () => import('three');`).some(isSceneEdge)).toBe(true);
    expect(specifiersOf(`require('@react-three/drei');`).some(isSceneEdge)).toBe(true);
    expect(specifiersOf(`import { TextField } from '@nastech/design-system';`).some(isSceneEdge)).toBe(false);
  });
});
