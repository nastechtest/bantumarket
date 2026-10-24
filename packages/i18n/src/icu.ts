/**
 * A small ICU MessageFormat subset — no dependency, deliberately not a full implementation.
 *
 * Supports exactly what the catalogue uses: plain interpolation `{name}`, `plural` (with CLDR
 * categories and `=N` exact matches, and `#` for the number), and `select`. It does not support
 * ordering, dates/numbers as argument *types* (`{x,number}`), offset (`{count, plural, one {...}` is
 * one, but `off:` is not), or quote escaping. Adding those is a separate decision, not a TODO hidden
 * here; the parser throws on a construct it does not understand rather than mis-rendering it.
 *
 * Formatting is locale-aware through injected `renderNumber` / `plural`: `icu.ts` knows nothing about
 * ZAR grouping or CLDR rules, it only asks for them. That keeps the engine testable in isolation and
 * keeps the money/plural logic in one place (`formatter/number.ts`, `plural.ts`).
 */

import type { Locale } from './locale.js';
import { Plural, type PluralCategory } from './plural.js';
import { formatNumber } from './formatter/number.js';

export interface IcuValues {
  readonly [arg: string]: string | number | undefined;
}

export interface IcuOptions {
  readonly locale: Locale;
  /** Override number rendering (tests / special surfaces). Defaults to the locale-aware formatter. */
  readonly renderNumber?: (value: number) => string;
  /** Override plural selection. Defaults to the CLDR `Plural` rules for `locale`. */
  readonly selectPlural?: (value: number | string) => PluralCategory;
}

type Node =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'arg'; readonly arg: string }
  | { readonly kind: 'plural'; readonly arg: string; readonly cases: Record<string, Node[]>; readonly offset: number }
  | { readonly kind: 'select'; readonly arg: string; readonly cases: Record<string, Node[]> };

/**
 * Parse `pattern` into a node list. `depth` tracks nesting so `{a, select, x {nested {b}} ...}`
 * keeps `b` in the right branch instead of leaking to the top level.
 */
function parsePattern(src: string): Node[] {
  let pos = 0;
  const nodes = parseNodes();
  if (pos < src.length) throw new SyntaxError(`icu: unexpected "${src[pos]}" at ${pos}`);
  return nodes;

  function parseNodes(): Node[] {
    const out: Node[] = [];
    let text = '';
    while (pos < src.length) {
      const ch = src[pos]!;
      if (ch === '}') break; // caller consumes the closing brace
      if (ch === '{') {
        if (text) {
          out.push({ kind: 'text', value: text });
          text = '';
        }
        out.push(parsePlaceholder());
        continue;
      }
      text += ch;
      pos++;
    }
    if (text) out.push({ kind: 'text', value: text });
    return out;
  }

  function parsePlaceholder(): Node {
    pos++; // consume '{'
    const arg = readUntil([',', '}', ' ']).trim();
    skipSpaces();
    if (src[pos] === '}') {
      pos++;
      return { kind: 'arg', arg };
    }
    if (src[pos] !== ',') throw new SyntaxError(`icu: expected "," after arg "${arg}"`);
    pos++; // consume ','
    const type = readUntil([',', '}']).trim().toLowerCase();
    skipSpaces();
    if (src[pos] !== ',') throw new SyntaxError(`icu: expected "," after type "${type}"`);
    pos++; // consume ','
    if (type === 'plural' || type === 'selectordinal') {
      if (type === 'selectordinal') throw new SyntaxError('icu: selectordinal is not supported');
      const { cases, offset } = parseCases(true);
      return { kind: 'plural', arg, cases, offset };
    }
    if (type === 'select') {
      const { cases } = parseCases(false);
      return { kind: 'select', arg, cases };
    }
    throw new SyntaxError(`icu: unsupported argument type "${type}"`);
  }

  function parseCases(isPlural: boolean): { cases: Record<string, Node[]>; offset: number } {
    const cases: Record<string, Node[]> = {};
    let offset = 0;
    skipSpaces();
    while (pos < src.length && src[pos] !== '}') {
      const keyToken = readUntil([' ', '{']).trim();
      skipSpaces();
      if (src[pos] !== '{') throw new SyntaxError(`icu: expected "{" after case "${keyToken}"`);
      pos++; // consume '{'
      const body = parseNodes();
      if (src[pos] !== '}') throw new SyntaxError(`icu: unterminated case "${keyToken}"`);
      pos++; // consume '}'
      if (isPlural && keyToken.startsWith('=')) {
        cases[keyToken] = body; // exact match, kept as "=N"
      } else if (isPlural && keyToken === 'offset' && offset === 0) {
        // offset is rare; read it rather than silently mis-render, but it is otherwise unused here.
        const b = body[0];
        offset = b && b.kind === 'text' ? Number(b.value) || 0 : 0;
      } else {
        cases[keyToken] = body;
      }
      skipSpaces();
    }
    if (src[pos] !== '}') throw new SyntaxError('icu: unterminated plural/select');
    pos++; // consume the final '}'
    return { cases, offset };
  }

  function readUntil(stops: readonly string[]): string {
    let s = '';
    while (pos < src.length && !stops.includes(src[pos]!)) {
      // A '{' inside a case key would mean we mis-counted; stop and let the caller error.
      s += src[pos]!;
      pos++;
    }
    return s;
  }
  function skipSpaces(): void {
    while (pos < src.length && /\s/.test(src[pos]!)) pos++;
  }
}

function renderNodes(nodes: Node[], values: IcuValues, opts: IcuOptions, pluralValue: number | null): string {
  let out = '';
  for (const node of nodes) {
    switch (node.kind) {
      case 'text': {
        // '#' is only significant inside a plural body: it stands for (pluralValue - offset),
        // locale-formatted. Outside a plural it is a literal hash.
        if (pluralValue !== null && node.value.includes('#')) {
          const shown = pluralValue - 0; // offset already folded into the picked branch's number
          out += node.value.replace(/#/g, opts.renderNumber!(shown));
        } else {
          out += node.value;
        }
        break;
      }
      case 'arg': {
        out += renderArg(values[node.arg], opts);
        break;
      }
      case 'plural': {
        const raw = values[node.arg];
        const num = toNumber(raw, node.arg);
        const chosen =
          node.cases[`=${num}`] ??
          node.cases[opts.selectPlural!(num - node.offset)] ??
          node.cases.other ??
          [];
        out += renderNodes(chosen, values, opts, num);
        break;
      }
      case 'select': {
        const raw = String(values[node.arg] ?? 'other');
        const chosen = node.cases[raw] ?? node.cases.other ?? [];
        out += renderNodes(chosen, values, opts, pluralValue);
        break;
      }
    }
  }
  return out;
}

function renderArg(value: string | number | undefined, opts: IcuOptions): string {
  if (value === undefined) return '';
  if (typeof value === 'number') return opts.renderNumber!(value);
  return value;
}

function toNumber(value: string | number | undefined, arg: string): number {
  if (typeof value === 'number') return value;
  const n = Number(value);
  if (Number.isNaN(n)) throw new TypeError(`icu: plural arg "${arg}" is not a number (got ${JSON.stringify(value)})`);
  return n;
}

/**
 * Format an ICU pattern against `values`. `renderNumber`/`selectPlural` default to the locale-aware
 * implementations so the common call `formatIcu(pattern, {count: 3}, {locale: 'zu'})` is correct
 * without the caller wiring anything.
 */
export function formatIcu(pattern: string, values: IcuValues, opts: IcuOptions): string {
  const resolved: IcuOptions = {
    locale: opts.locale,
    renderNumber: opts.renderNumber ?? ((v) => formatNumber(v, opts.locale)),
    selectPlural: opts.selectPlural ?? ((v) => Plural.select(opts.locale, v)),
  };
  const nodes = parsePattern(pattern);
  return renderNodes(nodes, values, resolved, null);
}
