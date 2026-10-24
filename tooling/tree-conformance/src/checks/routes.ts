/**
 * Rules 1, 6 and 8: the route table, the document landmark, and the no-session proof.
 *
 * These three all need the parsed router, so they live together. Rule 1 owns the route/page
 * mapping; rule 6 asks what the page modules render; rule 8 asks what the tests prove.
 */

import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { makeViolation, type Context, type Violation } from '../context.js';
import { defaultImportedTargets, resolveDefaultExport } from '../default-export.js';
import {
  CRITICAL_ROUTE_CLASS,
  NO_SESSION_MARKERS,
  REFUSAL_MARKERS,
} from '../rules.js';
import {
  maskNonCode,
  readRouter,
  relPath,
  resolveRelative,
} from '../scan.js';

export function ruleRouteCompleteness(ctx: Context): Violation[] {
  const out: Violation[] = [];
  for (const app of ctx.apps) {
    const routerRel = relPath(ctx.root, app.routerFile);
    if (!existsSync(app.routerFile)) {
      out.push(makeViolation(1, routerRel, 1, `${app.name} has no src/router.tsx; the Routes table is the app inventory`));
      continue;
    }
    const table = readRouter(app.routerFile, ctx.cache);
    for (const error of table.errors) out.push(makeViolation(1, routerRel, error.line, error.message));

    const routePaths = new Set<string>();
    const pagesByPath = new Map<string, typeof table.pages[number][]>();
    for (const page of table.pages) {
      const list = pagesByPath.get(page.path) ?? [];
      list.push(page);
      pagesByPath.set(page.path, list);
    }
    const moduleOwner = new Map<string, string>();

    for (const route of table.routes) {
      if (routePaths.has(route.path)) {
        out.push(makeViolation(1, routerRel, route.line, `duplicate Routes entry for '${route.path}'`));
        continue;
      }
      routePaths.add(route.path);
      const pages = pagesByPath.get(route.path) ?? [];
      if (pages.length !== 1) {
        out.push(
          makeViolation(
            1,
            routerRel,
            route.line,
            `route '${route.path}' has ${pages.length} page module(s); expected exactly one`,
          ),
        );
        continue;
      }
      const page = pages[0]!;
      const moduleFile = resolveRelative(app.routerFile, page.spec, ctx.cache);
      if (moduleFile === null) {
        out.push(
          makeViolation(
            1,
            routerRel,
            page.line,
            `route '${route.path}' loads '${page.spec}', which does not resolve to a .ts/.tsx module`,
          ),
        );
        continue;
      }
      const owner = moduleOwner.get(moduleFile);
      if (owner !== undefined && owner !== route.path) {
        out.push(
          makeViolation(
            1,
            routerRel,
            page.line,
            `page module '${page.spec}' is bound to both '${owner}' and '${route.path}'; each route needs exactly one page module`,
          ),
        );
      } else {
        moduleOwner.set(moduleFile, route.path);
      }

      const def = resolveDefaultExport(moduleFile, ctx.cache);
      if (!def.found) {
        out.push(
          makeViolation(
            1,
            relPath(ctx.root, def.file),
            def.line,
            `route '${route.path}' page module has no usable default export: ${def.reason}`,
          ),
        );
      } else if (!def.takesRoute) {
        out.push(
          makeViolation(
            1,
            relPath(ctx.root, def.file),
            def.line,
            `route '${route.path}' page default export does not take { route }: ${def.reason}`,
          ),
        );
      }
    }

    for (const page of table.pages) {
      if (!routePaths.has(page.path)) {
        out.push(
          makeViolation(
            1,
            routerRel,
            page.line,
            `page module '${page.spec}' is declared for '${page.path}', which is not in the Routes table`,
          ),
        );
      }
    }
  }
  return out;
}

interface MainHit {
  readonly line: number;
}

function mainLandmarks(text: string): MainHit[] {
  const masked = maskNonCode(text);
  const hits: MainHit[] = [];
  const patterns = [
    /<main(?=[\s/>])/g,
    /createElement\(\s*['"]main['"]/g,
    /(?:jsx|jsxs)\(\s*['"]main['"]/g,
  ];
  for (const re of patterns) {
    for (const m of masked.matchAll(re)) {
      hits.push({ line: masked.slice(0, m.index ?? 0).split('\n').length });
    }
  }
  hits.sort((a, b) => a.line - b.line);
  return hits;
}

export function ruleOneMainPerRoute(ctx: Context): Violation[] {
  const out: Violation[] = [];
  for (const app of ctx.apps) {
    if (!existsSync(app.routerFile)) continue;
    const table = readRouter(app.routerFile, ctx.cache);
    const pageModules = new Set<string>();
    for (const page of table.pages) {
      const routeModule = resolveRelative(app.routerFile, page.spec, ctx.cache);
      if (routeModule === null) continue;
      pageModules.add(routeModule);
      for (const file of resolveDefaultExport(routeModule, ctx.cache).chain) pageModules.add(file);
      for (const target of defaultImportedTargets(routeModule, ctx.cache)) {
        pageModules.add(target);
        for (const file of resolveDefaultExport(target, ctx.cache).chain) pageModules.add(file);
      }
    }
    for (const moduleFile of [...pageModules].sort()) {
      if (!moduleFile.startsWith(`${app.srcDir}/`)) continue;
      let text: string;
      try {
        text = ctx.cache.read(moduleFile);
      } catch {
        continue;
      }
      for (const hit of mainLandmarks(text)) {
        out.push(
          makeViolation(
            6,
            relPath(ctx.root, moduleFile),
            hit.line,
            'page module declares a <main> landmark; the app shell owns the document\'s single main',
          ),
        );
      }
    }
  }
  return out;
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function balancedCall(masked: string, openIndex: number): { readonly text: string; readonly end: number } | null {
  if (masked[openIndex] !== '(') return null;
  let depth = 0;
  let inString: string | null = null;
  for (let i = openIndex; i < masked.length; i += 1) {
    const c = masked[i]!;
    if (inString !== null) {
      if (c === '\\') {
        i += 1;
        continue;
      }
      if (c === inString) inString = null;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') {
      inString = c;
      continue;
    }
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return { text: masked.slice(openIndex + 1, i), end: i };
    }
  }
  return null;
}

function testBlocks(masked: string): string[] {
  const blocks: string[] = [];
  const callRe = /\b(?:it|test)(?:\.(?:only|skip|todo|failing|each\s*\((?:[^()]|\([^()]*\))*\)))?\s*\(/g;
  for (const m of masked.matchAll(callRe)) {
    const open = m.index + m[0].length - 1;
    const first = balancedCall(masked, open);
    if (first === null) continue;
    let block = first.text;
    // `test.each([...])('title', fn)` has a second call whose body is the test.
    let after = first.end + 1;
    while (after < masked.length && /\s/.test(masked[after]!)) after += 1;
    if (masked[after] === '(') {
      const second = balancedCall(masked, after);
      if (second !== null) block += `\n${second.text}`;
    }
    blocks.push(block);
  }
  return blocks;
}

function hasGuardBlock(text: string): boolean {
  const masked = maskNonCode(text);
  for (const block of testBlocks(masked)) {
    const noSession = NO_SESSION_MARKERS.some((re) => re.test(block));
    const refusal = REFUSAL_MARKERS.some((re) => re.test(block));
    const assertion = /\bexpect\s*\(/.test(block);
    if (noSession && refusal && assertion) return true;
  }
  return false;
}

export function ruleCriticalRouteGuard(ctx: Context): Violation[] {
  const out: Violation[] = [];
  for (const app of ctx.apps) {
    if (!existsSync(app.routerFile)) continue;
    const table = readRouter(app.routerFile, ctx.cache);
    const pagesByPath = new Map<string, string>();
    for (const page of table.pages) {
      const moduleFile = resolveRelative(app.routerFile, page.spec, ctx.cache);
      if (moduleFile !== null) pagesByPath.set(page.path, moduleFile);
    }
    const testFiles = app.files.filter((f) => /\.test\.(ts|tsx)$/.test(f.rel));
    for (const route of table.routes) {
      if (route.routeClass !== CRITICAL_ROUTE_CLASS) continue;
      const moduleFile = pagesByPath.get(route.path);
      const tokens = new Set<string>();
      if (moduleFile !== undefined) tokens.add(normalizeToken(basename(moduleFile).replace(/\.(ts|tsx)$/, '')));
      const staticSegments = route.path.split('/').filter((s) => s !== '' && !s.startsWith(':') && s !== '*');
      if (staticSegments.length > 0) tokens.add(normalizeToken(staticSegments[0]!));
      if (tokens.size === 0) tokens.add(normalizeToken(route.path));

      let guarded = false;
      for (const testFile of testFiles) {
        const base = basename(testFile.rel).replace(/\.test\.(ts|tsx)$/, '');
        const normalizedBase = normalizeToken(base);
        let text: string;
        try {
          text = ctx.cache.read(testFile.abs);
        } catch {
          continue;
        }
        const associated =
          [...tokens].some((token) => token !== '' && normalizedBase.includes(token)) ||
          text.includes(`'${route.path}'`) ||
          text.includes(`"${route.path}"`) ||
          (route.path.includes(':') && text.includes(`'${route.path.slice(0, route.path.indexOf(':'))}`));
        if (!associated) continue;
        if (hasGuardBlock(text)) {
          guarded = true;
          break;
        }
      }
      if (!guarded) {
        out.push(
          makeViolation(
            8,
            relPath(ctx.root, app.routerFile),
            route.line,
            `critical route '${route.path}' has no test asserting refusal or redirect without a session (looked for ${[...tokens].map((t) => `${t}*.test.*`).join(' or ')})`,
          ),
        );
      }
    }
  }
  return out;
}
