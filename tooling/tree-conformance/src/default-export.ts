/**
 * Follow a page module's default export to the function that actually receives `{ route }`.
 *
 * Route files in this repo are allowed to be one-line seams (`export { default } from ...`) and
 * identifiers (`export default ItemFeaturePage`), so a check that only looks at the route file would
 * either miss the contract or flag every seam. The resolver follows re-exports and default-import
 * bindings, with a hop limit so a cycle is reported rather than walked forever.
 */

import { dirname, resolve } from 'node:path';
import { maskNonCode, resolveRelative, type FileCache } from './scan.js';

export interface DefaultExportResult {
  readonly found: boolean;
  readonly takesRoute: boolean;
  readonly file: string;
  readonly line: number;
  /** Every module visited, starting with the file asked about. */
  readonly chain: readonly string[];
  readonly reason: string;
}

interface Located {
  readonly line: number;
  readonly index: number;
}

function lineAt(code: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < code.length; i += 1) if (code[i] === '\n') line += 1;
  return line;
}

/** Find the `(` after an export-default function/arrow and return its balanced parameter list. */
function paramsAfter(code: string, openIndex: number): string | null {
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
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return code.slice(openIndex + 1, i);
    }
  }
  return null;
}

function locate(re: RegExp, code: string): Located | null {
  const m = re.exec(code);
  if (m === null) return null;
  return { index: m.index, line: lineAt(code, m.index) };
}

function takesRoute(params: string): boolean {
  const trimmed = params.trim();
  if (!trimmed.startsWith('{')) return false;
  // The contract is the destructured property, not a prop named `route` inside an object literal
  // default value. `\broute\b` before the first `}` is precise enough for this repo's pages.
  const close = trimmed.indexOf('}');
  const head = close === -1 ? trimmed : trimmed.slice(0, close);
  return /\broute\b/.test(head);
}

/** The default export of `file`, without following anything. */
type Raw =
  | { readonly kind: 'function'; readonly line: number; readonly params: string }
  | { readonly kind: 'arrow'; readonly line: number; readonly params: string }
  | { readonly kind: 'identifier'; readonly line: number; readonly name: string }
  | { readonly kind: 'reexport'; readonly line: number; readonly spec: string }
  | { readonly kind: 'named-reexport'; readonly line: number; readonly name: string; readonly spec: string | null }
  | { readonly kind: 'class'; readonly line: number }
  | { readonly kind: 'missing' }
  | { readonly kind: 'opaque'; readonly line: number; readonly what: string };

function readRaw(code: string): Raw {
  const masked = maskNonCode(code);

  const reexport = locate(/\bexport\s*\{\s*default\s*\}\s*from\s*['"]([^'"]+)['"]/, masked);
  if (reexport !== null) {
    const m = /\bexport\s*\{\s*default\s*\}\s*from\s*['"]([^'"]+)['"]/.exec(masked)!;
    return { kind: 'reexport', line: reexport.line, spec: m[1]! };
  }

  const named = /\bexport\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+default\s*\}\s*(?:from\s*['"]([^'"]+)['"])?/.exec(masked);
  if (named !== null) {
    return {
      kind: 'named-reexport',
      line: lineAt(masked, named.index),
      name: named[1]!,
      spec: named[2] ?? null,
    };
  }

  const fn = /\bexport\s+default\s+(?:async\s+)?function\b/.exec(masked);
  if (fn !== null) {
    const open = masked.indexOf('(', fn.index + fn[0].length);
    if (open === -1) return { kind: 'opaque', line: lineAt(masked, fn.index), what: 'function without a parameter list' };
    const params = paramsAfter(masked, open);
    if (params === null) return { kind: 'opaque', line: lineAt(masked, fn.index), what: 'unbalanced function parameters' };
    return { kind: 'function', line: lineAt(masked, fn.index), params };
  }

  const arrow = /\bexport\s+default\s*(?:async\s*)?\(/.exec(masked);
  if (arrow !== null) {
    const open = arrow.index + arrow[0].length - 1;
    const params = paramsAfter(masked, open);
    if (params !== null) return { kind: 'arrow', line: lineAt(masked, arrow.index), params };
  }

  if (/\bexport\s+default\s+class\b/.test(masked)) {
    const hit = locate(/\bexport\s+default\s+class\b/, masked)!;
    return { kind: 'class', line: hit.line };
  }

  const ident = /\bexport\s+default\s+([A-Za-z_$][\w$]*)\s*;?/.exec(masked);
  if (ident !== null) {
    return { kind: 'identifier', line: lineAt(masked, ident.index), name: ident[1]! };
  }

  return { kind: 'missing' };
}

function localFunctionParams(masked: string, name: string): { readonly params: string; readonly line: number } | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fn = new RegExp(`\\bfunction\\s+${escaped}\\s*\\(`, 'm').exec(masked);
  if (fn !== null) {
    const open = masked.indexOf('(', fn.index + fn[0].length - 1);
    const params = open === -1 ? null : paramsAfter(masked, open);
    if (params !== null) return { params, line: lineAt(masked, fn.index) };
  }
  const assigned = new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\s*=\\s*(?:async\\s*)?(?:function\\s*(?:${escaped})?\\s*)?\\(`, 'm').exec(masked);
  if (assigned !== null) {
    const open = assigned.index + assigned[0].length - 1;
    const params = paramsAfter(masked, open);
    if (params !== null) return { params, line: lineAt(masked, assigned.index) };
  }
  return null;
}

function importedDefault(masked: string, name: string): { readonly spec: string; readonly line: number } | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const plain = new RegExp(`\\bimport\\s+${escaped}\\s*(?:,\\s*\\{[^}]*\\})?\\s+from\\s*['"]([^'"]+)['"]`, 'm').exec(masked);
  if (plain !== null) return { spec: plain[1]!, line: lineAt(masked, plain.index) };
  const braced = new RegExp(`\\bimport\\s*\\{\\s*default\\s+as\\s+${escaped}\\s*\\}\\s+from\\s*['"]([^'"]+)['"]`, 'm').exec(masked);
  if (braced !== null) return { spec: braced[1]!, line: lineAt(masked, braced.index) };
  return null;
}

const MAX_HOPS = 8;

export function resolveDefaultExport(startFile: string, cache: FileCache): DefaultExportResult {
  const chain: string[] = [];
  let file = startFile;
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    if (chain.includes(file)) {
      return {
        found: false,
        takesRoute: false,
        file,
        line: 1,
        chain,
        reason: `default-export re-export cycle at ${file}`,
      };
    }
    chain.push(file);
    let text: string;
    try {
      text = cache.read(file);
    } catch {
      return { found: false, takesRoute: false, file, line: 1, chain, reason: `could not read ${file}` };
    }
    const masked = maskNonCode(text);
    const raw = readRaw(text);

    if (raw.kind === 'function' || raw.kind === 'arrow') {
      return {
        found: true,
        takesRoute: takesRoute(raw.params),
        file,
        line: raw.line,
        chain,
        reason: takesRoute(raw.params)
          ? 'default export is a function taking { route }'
          : `default export params are \`${raw.params.trim()}\`, not a destructured { route }`,
      };
    }
    if (raw.kind === 'reexport') {
      const next = resolveRelative(file, raw.spec, cache);
      if (next === null) {
        return { found: false, takesRoute: false, file, line: raw.line, chain, reason: `re-export target ${raw.spec} does not resolve` };
      }
      file = next;
      continue;
    }
    if (raw.kind === 'named-reexport') {
      if (raw.spec !== null) {
        const next = resolveRelative(file, raw.spec, cache);
        if (next === null) {
          return { found: false, takesRoute: false, file, line: raw.line, chain, reason: `re-export target ${raw.spec} does not resolve` };
        }
        // `{ X as default } from '...'` exports the named binding, not the target's default. The
        // target's X may itself be a function; read it directly if it is a local declaration.
        const targetText = cache.read(next);
        const targetMasked = maskNonCode(targetText);
        const local = localFunctionParams(targetMasked, raw.name);
        if (local !== null) return { found: true, takesRoute: takesRoute(local.params), file: next, line: local.line, chain, reason: 'named re-export resolves to a local function' };
        chain.push(next);
        return { found: false, takesRoute: false, file: next, line: raw.line, chain, reason: `named re-export ${raw.name} is not a local function` };
      }
      const local = localFunctionParams(masked, raw.name);
      if (local !== null) return { found: true, takesRoute: takesRoute(local.params), file, line: local.line, chain, reason: 'local binding exported as default' };
      return { found: false, takesRoute: false, file, line: raw.line, chain, reason: `local binding ${raw.name} is not a function declaration` };
    }
    if (raw.kind === 'identifier') {
      const local = localFunctionParams(masked, raw.name);
      if (local !== null) {
        return { found: true, takesRoute: takesRoute(local.params), file, line: local.line, chain, reason: 'local function exported as default' };
      }
      const imported = importedDefault(masked, raw.name);
      if (imported !== null) {
        const next = resolveRelative(file, imported.spec, cache);
        if (next === null) {
          return { found: false, takesRoute: false, file, line: raw.line, chain, reason: `default export ${raw.name} is imported from ${imported.spec}, which does not resolve` };
        }
        file = next;
        continue;
      }
      return { found: false, takesRoute: false, file, line: raw.line, chain, reason: `default export ${raw.name} has no local function or default import` };
    }
    if (raw.kind === 'class') {
      return { found: true, takesRoute: false, file, line: raw.line, chain, reason: 'default export is a class, not a page function taking { route }' };
    }
    if (raw.kind === 'opaque') {
      return { found: false, takesRoute: false, file, line: raw.line, chain, reason: raw.what };
    }
    return { found: false, takesRoute: false, file, line: 1, chain, reason: 'no default export found' };
  }
  return { found: false, takesRoute: false, file, line: 1, chain, reason: `default export chain exceeded ${MAX_HOPS} hops` };
}

/** The module a route file renders as its page, when it imports a default component from a sibling. */
export function defaultImportedTargets(file: string, cache: FileCache): string[] {
  let text: string;
  try {
    text = cache.read(file);
  } catch {
    return [];
  }
  const masked = maskNonCode(text);
  const out: string[] = [];
  for (const m of masked.matchAll(/\bimport\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s+from\s*['"]([^'"]+)['"]/g)) {
    const next = resolveRelative(file, m[2]!, cache);
    if (next !== null) out.push(next);
  }
  return out;
}

export function dirOf(file: string): string {
  return dirname(resolve(file));
}
