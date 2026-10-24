/**
 * Source scanning primitives: one file walk, one comment/string masker, one import reader, one
 * module resolver, one router reader.
 *
 * Everything here is deterministic and mkdir-free. The checker calls it against the real tree and
 * against temp fixture trees, so nothing may assume it lives inside this package.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { EXCLUDED_DIR_NAMES } from './rules.js';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const ALL_TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const JS_EXTENSIONS = new Set(['.js', '.jsx']);

export interface SourceFile {
  readonly abs: string;
  readonly rel: string;
  readonly ext: string;
  readonly text: string;
}

export interface FileCache {
  readonly read: (abs: string) => string;
  readonly exists: (abs: string) => boolean;
}

export function createFileCache(): FileCache {
  const cache = new Map<string, string>();
  return {
    read(abs: string): string {
      const hit = cache.get(abs);
      if (hit !== undefined) return hit;
      const text = readFileSync(abs, 'utf8');
      cache.set(abs, text);
      return text;
    },
    exists(abs: string): boolean {
      return existsSync(abs);
    },
  };
}

export function toPosix(path: string): string {
  return path.split(sep).join('/');
}

export function relPath(root: string, abs: string): string {
  return toPosix(relative(root, abs));
}

export function isSourceFile(name: string): boolean {
  return SOURCE_EXTENSIONS.has(extname(name)) && !name.endsWith('.d.ts');
}

/** A file on disk that the walker saw, before its text is needed. */
export interface WalkedFile {
  readonly abs: string;
  readonly rel: string;
  readonly ext: string;
}

/**
 * Walk `root` once, sorted, skipping dependency and build directories. The caller decides which
 * extensions matter; returning metadata keeps rule 5 (which looks for .js) cheap.
 */
export function walkFiles(root: string): WalkedFile[] {
  const out: WalkedFile[] = [];
  const visit = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
        visit(join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = extname(entry.name);
      if (!ALL_TS_EXTENSIONS.has(ext)) continue;
      if (entry.name.endsWith('.d.ts')) continue;
      const abs = join(dir, entry.name);
      out.push({ abs, rel: relPath(root, abs), ext });
    }
  };
  visit(root);
  return out;
}

export function isUnder(abs: string, dir: string): boolean {
  const rel = relative(dir, abs);
  return rel !== '' && !rel.startsWith('..') && !rel.includes(`..${sep}`);
}

/**
 * Remove comments and template-literal payloads while preserving every newline and every
 * single/double-quoted string. Import specifiers live in those strings, so they must survive;
 * comments and templates are where test files embed fake imports, and those must not become edges.
 *
 * The output has the same length as the input, so a match offset still maps to the original line.
 */
export function maskNonCode(code: string): string {
  const out: string[] = new Array(code.length);
  let i = 0;
  const blank = (from: number, to: number): void => {
    for (let j = from; j < to && j < code.length; j += 1) {
      out[j] = code[j] === '\n' ? '\n' : ' ';
    }
  };
  while (i < code.length) {
    const c = code[i]!;
    const next = code[i + 1];
    if (c === '/' && next === '/') {
      const start = i;
      i += 2;
      while (i < code.length && code[i] !== '\n') i += 1;
      blank(start, i);
      continue;
    }
    if (c === '/' && next === '*') {
      const start = i;
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i += 1;
      i = Math.min(i + 2, code.length);
      blank(start, i);
      continue;
    }
    if (c === '\'' || c === '"') {
      const quote = c;
      out[i] = c;
      i += 1;
      while (i < code.length) {
        const ch = code[i]!;
        out[i] = ch;
        if (ch === '\\') {
          if (i + 1 < code.length) {
            out[i + 1] = code[i + 1]!;
            i += 2;
            continue;
          }
        }
        i += 1;
        if (ch === quote) break;
      }
      continue;
    }
    if (c === '`') {
      const start = i;
      out[i] = ' ';
      i += 1;
      while (i < code.length) {
        const ch = code[i]!;
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === '`') {
          out[i] = ' ';
          i += 1;
          break;
        }
        out[i] = ch === '\n' ? '\n' : ' ';
        i += 1;
      }
      // A template that never closes still needs its started region blanked.
      if (i >= code.length) blank(start, code.length);
      continue;
    }
    out[i] = c;
    i += 1;
  }
  return out.join('');
}

export type ImportKind = 'static' | 'dynamic' | 'require';

export interface ImportEdge {
  readonly spec: string;
  readonly kind: ImportKind;
  /** The clause between `import`/`export` and `from`, for default-import detection. */
  readonly clause: string;
  readonly line: number;
}

function lineAt(code: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < code.length; i += 1) {
    if (code[i] === '\n') line += 1;
  }
  return line;
}

/**
 * The four import shapes this repo writes, read from masked source. `import type` and `export
 * type` are edges: type coupling across a feature or package boundary is still coupling, and this
 * gate is about structure rather than bytes.
 */
export function scanImports(code: string): ImportEdge[] {
  const masked = maskNonCode(code);
  const edges: ImportEdge[] = [];
  const seen = new Set<string>();

  const push = (spec: string, kind: ImportKind, clause: string, index: number): void => {
    const key = `${kind}:${spec}:${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ spec, kind, clause, line: lineAt(masked, index) });
  };

  for (const m of masked.matchAll(/(?:^|[\s;}])(import|export)\s+([^;'"`]*?)\s+from\s*['"]([^'"]+)['"]/g)) {
    // The match includes one leading separator; the line is where the clause starts.
    const offset = (m.index ?? 0) + m[0].indexOf(m[1]!);
    push(m[3]!, 'static', m[2]!.trim(), offset);
  }
  for (const m of masked.matchAll(/(?:^|[\s;}])(?:import)\s*['"]([^'"]+)['"]/g)) {
    const offset = (m.index ?? 0) + m[0].indexOf('import');
    push(m[1]!, 'static', '', offset);
  }
  for (const m of masked.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    push(m[1]!, 'dynamic', '', m.index ?? 0);
  }
  for (const m of masked.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    push(m[1]!, 'require', '', m.index ?? 0);
  }
  return edges;
}

export function isRelativeSpec(spec: string): boolean {
  return spec.startsWith('./') || spec.startsWith('../');
}

/**
 * Resolve a relative specifier the way this repo writes it: TypeScript source with ESM `.js`
 * suffixes. A resolver that only tries the literal path misses every `./x.js` edge.
 */
export function resolveRelative(fromFile: string, spec: string, cache: FileCache): string | null {
  if (!isRelativeSpec(spec)) return null;
  const base = resolve(dirname(fromFile), spec);
  const ext = extname(base);
  const stripped = ALL_TS_EXTENSIONS.has(ext) ? base.slice(0, -ext.length) : base;
  const candidates: string[] = [base];
  for (const e of ['.ts', '.tsx', '.js', '.jsx']) {
    candidates.push(`${stripped}${e}`);
    candidates.push(`${base}${e}`);
  }
  for (const e of ['.ts', '.tsx', '.js', '.jsx']) candidates.push(join(stripped, `index${e}`));
  for (const candidate of candidates) {
    // existsSync on a directory would lie; an import must land on a file.
    if (cache.exists(candidate) && statSync(candidate).isFile() && isSourceFile(candidate)) return candidate;
  }
  return null;
}

/** Split a workspace specifier into package name and subpath key (`.`, `./scene`, ...). */
export function parseWorkspaceSpec(spec: string): { pkg: string; subpath: string } | null {
  const m = spec.match(/^(@nastech\/[a-z0-9-]+)(?:\/(.+))?$/i);
  if (!m) return null;
  const subpath = m[2] === undefined ? '.' : `./${m[2]}`;
  return { pkg: m[1]!, subpath };
}

/**
 * Does a package's `exports` map declare `subpath`? Conditional objects are handled: top-level keys
 * beginning with `.` are subpaths; an object with no such keys describes the "." condition bag.
 * Wildcards follow Node's rule (one `*`, any characters).
 */
export function exportsDeclare(exportsValue: unknown, subpath: string): boolean {
  if (typeof exportsValue === 'string') return subpath === '.';
  if (exportsValue === null || typeof exportsValue !== 'object') return false;
  const keys = Object.keys(exportsValue as Record<string, unknown>);
  const subpathKeys = keys.filter((k) => k.startsWith('.'));
  if (subpathKeys.length === 0) return subpath === '.';
  for (const key of subpathKeys) {
    if (key === subpath) return true;
    const star = key.indexOf('*');
    if (star === -1) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (subpath.startsWith(prefix) && subpath.endsWith(suffix) && subpath.length >= prefix.length + suffix.length) {
      return true;
    }
  }
  return false;
}

export interface RouteEntry {
  readonly path: string;
  readonly routeClass: string;
  readonly line: number;
}

export interface PageEntry {
  readonly path: string;
  readonly spec: string;
  readonly line: number;
}

export interface RouterTable {
  readonly routes: readonly RouteEntry[];
  readonly pages: readonly PageEntry[];
  readonly errors: readonly { readonly line: number; readonly message: string }[];
}

function findBlock(code: string, startRe: RegExp, open: string, close: string): { readonly start: number; readonly body: string; readonly bodyOffset: number } | null {
  const m = startRe.exec(code);
  if (!m) return null;
  const openIndex = code.indexOf(open, m.index + m[0].length - 1);
  if (openIndex === -1) return null;
  let depth = 0;
  let inString: string | null = null;
  for (let i = openIndex; i < code.length; i += 1) {
    const c = code[i]!;
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
    if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) {
        return { start: openIndex, body: code.slice(openIndex + 1, i), bodyOffset: openIndex + 1 };
      }
    }
  }
  return null;
}

/**
 * Read one router.tsx. The Routes table is the inventory; the pages table is the mapping. Both are
 * parsed as blocks rather than with a regex that assumes one-per-line, because a formatter may wrap
 * an entry and the gate must not go quiet when it does.
 */
export function readRouter(routerFile: string, cache: FileCache): RouterTable {
  const text = cache.read(routerFile);
  const masked = maskNonCode(text);
  const errors: { line: number; message: string }[] = [];
  const routes: RouteEntry[] = [];
  const pages: PageEntry[] = [];

  const routeBlock = findBlock(masked, /export\s+const\s+Routes\b[\s\S]*?=\s*\[/, '[', ']');
  if (routeBlock === null) {
    errors.push({ line: 1, message: 'could not find `export const Routes ... = [` in router.tsx' });
  } else {
    for (const m of routeBlock.body.matchAll(/\{([^{}]*)\}/g)) {
      const body = m[1]!;
      const pathMatch = body.match(/path\s*:\s*['"]([^'"]+)['"]/);
      const classMatch = body.match(/class\s*:\s*['"]([^'"]+)['"]/);
      if (pathMatch === null) {
        errors.push({ line: lineAt(masked, routeBlock.bodyOffset + (m.index ?? 0)), message: 'Routes entry has no string `path`' });
        continue;
      }
      if (classMatch === null) {
        errors.push({ line: lineAt(masked, routeBlock.bodyOffset + (m.index ?? 0)), message: `Routes entry ${pathMatch[1]} has no string \`class\`` });
        continue;
      }
      routes.push({
        path: pathMatch[1]!,
        routeClass: classMatch[1]!,
        line: lineAt(masked, routeBlock.bodyOffset + (m.index ?? 0)),
      });
    }
    if (routes.length === 0) errors.push({ line: 1, message: 'Routes table parsed but is empty' });
  }

  const pageBlock = findBlock(masked, /const\s+pages\b[\s\S]*?=\s*\{/, '{', '}');
  if (pageBlock === null) {
    errors.push({ line: 1, message: 'could not find `const pages ... = {` in router.tsx' });
  } else {
    const entryRe = /['"]([^'"]+)['"]\s*:\s*\(\s*\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)/g;
    for (const m of pageBlock.body.matchAll(entryRe)) {
      pages.push({
        path: m[1]!,
        spec: m[2]!,
        line: lineAt(masked, pageBlock.bodyOffset + (m.index ?? 0)),
      });
    }
    if (pages.length === 0) errors.push({ line: 1, message: 'pages table parsed but has no `path: () => import(...)` entries' });
  }

  return { routes, pages, errors };
}

export function findPackageJsonDirs(root: string): string[] {
  const dir = join(root, 'packages');
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !EXCLUDED_DIR_NAMES.has(e.name))
      .map((e) => join(dir, e.name))
      .filter((p) => existsSync(join(p, 'package.json')))
      .sort();
  } catch {
    return [];
  }
}

export function findAppDirs(root: string): string[] {
  const dir = join(root, 'apps');
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !EXCLUDED_DIR_NAMES.has(e.name))
      .map((e) => join(dir, e.name))
      .filter((p) => existsSync(join(p, 'src')) || existsSync(join(p, 'package.json')))
      .sort();
  } catch {
    return [];
  }
}

export function readPackageExports(packageDir: string, cache: FileCache): { readonly name: string; readonly exportsValue: unknown; readonly error: string | null } {
  const file = join(packageDir, 'package.json');
  try {
    const parsed = JSON.parse(cache.read(file)) as { name?: unknown; exports?: unknown };
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      exportsValue: parsed.exports,
      error: null,
    };
  } catch (error) {
    return { name: '', exportsValue: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export function countLines(text: string): number {
  if (text.length === 0) return 0;
  let count = 0;
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') count += 1;
  if (!text.endsWith('\n')) count += 1;
  return count;
}
