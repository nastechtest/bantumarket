import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve as rpath } from 'node:path';

/**
 * The dashboard is the first screen a seller sees, often on a data-queue connection. It is an
 * `app`-class route, so the scene runtime may not be reachable from its import closure in any
 * shape — static, dynamic or `require`. The root fence script does not cover this app yet (wave-C
 * rule), so this test is the fence for this directory. It walks the graph rather than grepping one
 * file, because the usual break is a friendly helper that imports a viewer.
 */

const HERE = dirname(new URL(import.meta.url).pathname);
const FEATURE = HERE;
const REPO_PACKAGES = rpath(HERE, '../../../../../packages');

const SCENE_PACKAGES = ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing', '@nastech/ui-3d'];

function isSceneEdge(spec: string): boolean {
  return SCENE_PACKAGES.some((p) => spec === p || spec.startsWith(`${p}/`));
}

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

function resolveLocal(fromFile: string, spec: string): string | null {
  const base = rpath(dirname(fromFile), spec);
  const stripped = base.replace(/\.jsx?$/, '');
  for (const candidate of [`${stripped}.ts`, `${stripped}.tsx`, `${stripped}.css`, `${stripped}/index.ts`, `${stripped}/index.tsx`]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function resolvePackage(spec: string): string | null {
  const match = spec.match(/^@nastech\/([\w-]+)/);
  if (match === null) return existsSync(spec) ? spec : null;
  const entry = `${REPO_PACKAGES}/${match[1]}/src/index.ts`;
  return existsSync(entry) ? entry : null;
}

function walk(file: string, seen = new Set<string>(), chain: string[] = []): string[] {
  if (seen.has(file)) return [];
  seen.add(file);
  if (!/\.(ts|tsx)$/.test(file)) return [];
  const code = readFileSync(file, 'utf8');
  const hits: string[] = [];
  for (const spec of specifiersOf(code)) {
    if (isSceneEdge(spec)) {
      hits.push([...chain, `${relative(FEATURE, file)} → ${spec}`].join(' | '));
      continue;
    }
    const next = spec.startsWith('.') ? resolveLocal(file, spec) : resolvePackage(spec);
    if (next !== null) hits.push(...walk(next, seen, [...chain, relative(FEATURE, file)]));
  }
  return hits;
}

describe('dashboard: app-class route may not reach the scene runtime', () => {
  it('walks a non-trivial closure', () => {
    const entry = `${FEATURE}/index.ts`;
    expect(existsSync(entry)).toBe(true);
    expect(existsSync(`${FEATURE}/dashboard-page.tsx`)).toBe(true);
  });

  it('has no scene edge anywhere in the closure', () => {
    const hits = walk(`${FEATURE}/index.ts`);
    expect(hits, `scene runtime reachable:\n${hits.join('\n')}`).toEqual([]);
  });

  it('the scanner actually fires on every import shape it claims to cover', () => {
    expect(specifiersOf(`import { SceneHost } from '@nastech/ui-3d/scene';`).some(isSceneEdge)).toBe(true);
    expect(specifiersOf(`const load = () => import('three');`).some(isSceneEdge)).toBe(true);
    expect(specifiersOf(`const t = require('@react-three/fiber');`).some(isSceneEdge)).toBe(true);
    expect(specifiersOf(`import { money } from '@nastech/api-contracts';`).some(isSceneEdge)).toBe(false);
  });
});
