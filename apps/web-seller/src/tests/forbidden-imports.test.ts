import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import './dom-setup.js';
import { Routes } from '../router.js';

/**
 * The app-scoped fence. `scripts/check-3d-boundaries.ts` reads web-public's router only, so
 * this app has to carry its own rule: `app` and `critical` routes may never reach the scene
 * runtime, even lazily, and neither may the shell.
 *
 * The allowed surface is *derived*, not listed: the files reachable only from the scene-class
 * routes are the one place `@nastech/ui-3d` may appear. Files shared with any app route, orphan
 * files, and the shell all get scanned. A new app route that imports a scene module makes that
 * module shared, which removes it from the allowed set and fails this test.
 */

const SRC = new URL('..', import.meta.url).pathname;
const ROUTER = join(SRC, 'router.tsx');

const FORBIDDEN_PREFIXES = [
  '@nastech/ui-3d',
  'three',
  '@react-three',
  // Wave-B packages still being authored elsewhere: coupling this app's green state to them
  // would make this fence fail for reasons outside the seller structure.
  '@nastech/i18n',
  '@nastech/forms',
  '@nastech/testing',
];

export function isForbidden(spec: string): boolean {
  return FORBIDDEN_PREFIXES.some((prefix) => spec === prefix || spec.startsWith(`${prefix}/`));
}

/** The same four import shapes the root fence reads: static, bare, dynamic and require. */
export function specifiersOf(code: string): string[] {
  const specs: string[] = [];
  for (const match of code.matchAll(
    /(?:^|[\s;}])(?:import|export)\s+[\s\S]*?\s*from\s*['"]([^'"]+)['"]/g,
  )) {
    specs.push(match[1]!);
  }
  for (const match of code.matchAll(/(?:^|[\s;})]?)import\s*['"]([^'"]+)['"]/g)) specs.push(match[1]!);
  for (const match of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(match[1]!);
  for (const match of code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(match[1]!);
  return specs;
}

export function violationsInSource(code: string): string[] {
  return specifiersOf(code).filter(isForbidden);
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'tests' || entry.name === 'node_modules') continue;
    if (entry.name.includes('.test.') || entry.name.includes('.spec.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function resolveSourceFile(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  const jsStripped = base.endsWith('.js') ? base.slice(0, -3) : base;
  const candidates = [
    base,
    `${jsStripped}.ts`,
    `${jsStripped}.tsx`,
    join(jsStripped, 'index.ts'),
    join(jsStripped, 'index.tsx'),
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    if (!/\.(ts|tsx)$/.test(candidate)) continue;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Type-only imports vanish at runtime, so they are not reachability edges for the budget fence. */
function stripTypeOnlyImports(code: string): string {
  return code.replace(
    /(?:^|[\n;])\s*(?:import|export)\s+type\s+[\s\S]*?\s+from\s*['"][^'"]+['"]\s*;?/g,
    '\n',
  );
}

/**
 * Every source file reachable from an entry module through *runtime* relative imports.
 *
 * Two graph edges are deliberately not followed:
 * - `import type` / `export type`: type-only edges disappear from the bundle.
 * - `router.tsx` -> `./routes/*`: the router's page table is the registry of entry points the
 *   fence starts from, not a runtime dependency of a page. Following it would make every page
 *   reachable from every other page and leave no scene-only surface to permit.
 */
export function importGraphFrom(entry: string): Set<string> {
  const files = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (files.has(file) || !existsSync(file)) continue;
    files.add(file);
    const code = stripTypeOnlyImports(readFileSync(file, 'utf8'));
    for (const specifier of specifiersOf(code)) {
      if (file === ROUTER && /^\.\/routes\//.test(specifier)) continue;
      const target = resolveSourceFile(file, specifier);
      if (target !== null && !files.has(target)) stack.push(target);
    }
  }
  return files;
}

function routeModuleMap(routerSource: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of routerSource.matchAll(
    /'([^']+)'\s*:\s*\(\)\s*=>\s*import\('\.\/routes\/([^']+)\.js'\)/g,
  )) {
    map.set(match[1]!, join(SRC, 'routes', `${match[2]!}.tsx`));
  }
  return map;
}

export function cssBudgetViolations(css: string): string[] {
  const violations: string[] = [];
  if (/^\s*@import\s/m.test(css)) violations.push('@import chain (render-blocking stylesheet)');
  if (/url\(\s*['"]?(https?:)?\/\//.test(css)) violations.push('remote url() in chrome CSS');
  if (/font-family:[^;}]*icon/i.test(css)) violations.push('icon font in chrome CSS');
  for (const face of css.matchAll(/@font-face\s*\{[^}]*\}/g)) {
    if (!/font-display:\s*optional/.test(face[0]!)) {
      violations.push('@font-face without font-display: optional');
    }
  }
  return violations;
}

describe('seller app import fence', () => {
  const routerSource = readFileSync(ROUTER, 'utf8');
  const modulesByPath = routeModuleMap(routerSource);
  const allFiles = sourceFiles(SRC);

  it('scans the whole structure, not an empty set', () => {
    expect(allFiles.length).toBeGreaterThanOrEqual(20);
    expect(allFiles.some((file) => file.endsWith(join('layout', 'shell.tsx')))).toBe(true);
    expect(allFiles.some((file) => file.endsWith(join('nav', 'guard.ts')))).toBe(true);
    expect(allFiles.some((file) => file.endsWith('bootstrap.ts'))).toBe(true);
    expect(allFiles.some((file) => file.endsWith('styles.css'))).toBe(false);
  });

  it('every route has exactly one page module and every page module has a route', () => {
    for (const route of Routes) {
      expect(modulesByPath.has(route.path), `no page module for ${route.path}`).toBe(true);
    }
    const routePaths = new Set(Routes.map((route) => route.path));
    for (const path of modulesByPath.keys()) {
      expect(routePaths.has(path), `page module for unknown route ${path}`).toBe(true);
    }
  });

  it('no app/critical route, shared file or orphan reaches the scene runtime', () => {
    const sceneRoutes = Routes.filter((route) => route.class === 'scene');
    const appRoutes = Routes.filter((route) => route.class !== 'scene');
    expect(sceneRoutes.length).toBeGreaterThan(0);

    const sceneGraph = new Set<string>();
    for (const route of sceneRoutes) {
      const module = modulesByPath.get(route.path);
      if (module === undefined) continue;
      for (const file of importGraphFrom(module)) sceneGraph.add(file);
    }

    const appGraph = new Set<string>();
    for (const route of appRoutes) {
      const module = modulesByPath.get(route.path);
      if (module === undefined) continue;
      for (const file of importGraphFrom(module)) appGraph.add(file);
    }

    // A file shared with an app route is not scene-only, so it is scanned below.
    const sceneOnly = new Set([...sceneGraph].filter((file) => !appGraph.has(file)));
    expect(sceneOnly.size).toBeGreaterThan(0);

    for (const route of sceneRoutes) {
      const module = modulesByPath.get(route.path);
      if (module !== undefined) {
        expect(appGraph.has(module), `scene route ${route.path} is also reached by an app route`).toBe(false);
      }
    }

    const violations: string[] = [];
    for (const file of allFiles) {
      if (sceneOnly.has(file)) continue;
      for (const specifier of violationsInSource(readFileSync(file, 'utf8'))) {
        violations.push(`${relative(SRC, file)} imports ${specifier}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('the scanner fires on injected violations and stays quiet on clean imports', () => {
    const injections = [
      `import { CanvasHost } from '@nastech/ui-3d/scene';`,
      `export { PosterFallback } from '@nastech/ui-3d';`,
      `const THREE = require('three');`,
      `const load = () => import('@react-three/fiber');`,
      `import 'three/examples/jsm/controls/OrbitControls';`,
      `import { render } from '@nastech/testing';`,
      `import { useLocale } from '@nastech/i18n';`,
      `import { Form } from '@nastech/forms';`,
    ];
    for (const code of injections) {
      expect(violationsInSource(code).length, `missed: ${code}`).toBeGreaterThan(0);
    }
    const clean = [
      `import { MoneyText } from '@nastech/design-system';`,
      `import { routes } from './router.js';`,
      `import { createRoot } from 'react-dom/client';`,
    ].join('\n');
    expect(violationsInSource(clean)).toEqual([]);
  });

  it('shell CSS pays no blocking or cross-origin request', () => {
    const css = readFileSync(join(SRC, 'styles.css'), 'utf8');
    expect(cssBudgetViolations(css)).toEqual([]);
    expect(css).toContain('prefers-reduced-motion');
  });

  it('the CSS scanner fires on injected violations', () => {
    const injections = [
      `@import url("https://fonts.example.com/x.css");`,
      `@font-face { font-family: "Brand"; src: url("/fonts/brand.woff2"); }`,
      `body { background: url("https://cdn.example.com/tile.png"); }`,
      `.x::before { font-family: "NasIcons"; content: "\\e901"; }`,
    ];
    for (const code of injections) {
      expect(cssBudgetViolations(code).length, `missed: ${code}`).toBeGreaterThan(0);
    }
    expect(cssBudgetViolations(`.x { background: url("/icons/watch.svg"); }`)).toEqual([]);
  });
});
