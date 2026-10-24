import { describe, it, expect } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The token fence, local. Every colour, radius, space and z-index value in the part-two
 * directories must originate from `@nastech/design-tokens` (or the alpha treatment in
 * `overlay/veil.ts`, which takes a `raw.color` primitive as its first argument — never a
 * literal). Same shape as the committed import fence: scan the files themselves so the edit
 * that breaks the rule breaks a test here, not a design review three weeks later.
 *
 * Deliberate allowances, each provenance-checked:
 *  - `1px solid` hairline borders — the committed `badge/card/field/sheet` precedent; there is
 *    no 1px in the space scale and inventing one would fork the idiom.
 *  - `…${runtimeValue}px` templates (scroll offsets), where the digit before `px` is a `}`.
 *  - `rem` font/layout sizes: the committed idiom (`0.875rem`), relative to root font-size,
 *    not a device-pixel claim.
 *  - z-index: only the numeric-free references to `LAYER` (defined in `overlay/layer.ts`, the
 *    single scale) and the `z-index:${LAYER.x}` template in `skip-link.tsx`.
 * `boxShadow` / `text-shadow` are forbidden outright: the token package defines no shadow, so a
 * shadow here would by definition be off-token (CONTRACT-GAP noted in the report).
 */

const SRC = new URL('..', import.meta.url).pathname;
const OWNED_DIRS = ['overlay', 'data', 'nav', 'feedback', 'patterns'];

interface Violation {
  readonly file: string;
  readonly rule: string;
  readonly hit: string;
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const RULES: ReadonlyArray<{ name: string; re: RegExp; skip?: (hit: string) => boolean }> = [
  { name: 'hex-colour', re: /#[0-9A-Fa-f]{3,8}\b/g },
  { name: 'rgba-rgb-literal', re: /rgba?\(\s*[\d.#][^)]*\)/g },
  { name: 'hsl-literal', re: /hsl\(\s*[\d.#][^)]*\)/g },
  {
    // `1px solid` is the sanctioned hairline; every other `Npx` must be a token reference.
    name: 'px-literal',
    re: /\b\d+(?:\.\d+)?px\b/g,
  },
  { name: 'shadow', re: /(?:box-shadow|boxShadow|text-shadow|textShadow)\s*[:=]/g },
  { name: 'z-index-literal', re: /(?:z-index|zIndex)\s*[:=]\s*['"]?\d/g },
];

function violationsFor(code: string, fileLabel: string): Violation[] {
  const body = stripComments(code);
  const out: Violation[] = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    for (const m of body.matchAll(rule.re)) {
      const hit = m[0]!;
      if (rule.name === 'px-literal' && body.slice(Math.max(0, (m.index ?? 0) - 3), (m.index ?? 0) + hit.length + 6).includes('1px solid')) {
        continue; // hairline border precedent
      }
      out.push({ file: fileLabel, rule: rule.name, hit });
    }
  }
  return out;
}

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) found.push(full);
  }
  return found;
}

describe('design-system token-literal fence', () => {
  const files = OWNED_DIRS.flatMap((d) => sourceFiles(join(SRC, d)));

  it('scans every owned file (the part-two directories, not an empty set)', () => {
    expect(files.length).toBeGreaterThanOrEqual(30);
    for (const d of OWNED_DIRS) {
      expect(files.some((f) => f.includes(`/${d}/`)), `no files scanned in ${d}`).toBe(true);
    }
  });

  it('no owned file carries an off-token colour, px, shadow or z-index literal', () => {
    const all: Violation[] = [];
    for (const file of files) all.push(...violationsFor(readFileSync(file, 'utf8'), relative(SRC, file)));
    expect(all, all.map((v) => `${v.file}: ${v.rule} → ${v.hit}`).join('\n')).toEqual([]);
  });

  it('the fence fires on injected violations — a guard that never caught anything proves nothing', () => {
    const injections = [
      `const c = { color: '#0F62FE' };`,
      `style={{ background: 'rgba(11, 13, 16, 0.55)' }}`,
      `style={{ padding: '16px' }}`,
      `style={{ borderRadius: '8px', boxShadow: '0 2px 8px #000' }}`,
      `style={{ zIndex: 30 }}`,
      `.x{ z-index: 99; }`,
      `const hsl = 'hsl(220, 90%, 56%)';`,
    ];
    for (const code of injections) {
      expect(violationsFor(code, 'injected').length, `missed: ${code}`).toBeGreaterThan(0);
    }
  });

  it('the sanctioned idioms pass — or the fence would flag the committed style itself', () => {
    const clean = [
      `import { raw } from '@nastech/design-tokens';\nstyle={{ gap: raw.space.s2, border: \`1px solid \${raw.color.ink100}\` }}`,
      `body.style.top = \`-\${savedScrollY}px\`;`,
      `style={{ zIndex: LAYER.overlay, fontSize: '0.875rem' }}`,
      `.x{ z-index:\${LAYER.sticky}; width:\${raw.space.s1}; }`,
      `const scrim = dim(raw.color.ink900, 0.55);`,
    ];
    for (const code of clean) {
      expect(violationsFor(code, 'clean'), `false positive: ${code}`).toEqual([]);
    }
  });

  it('veil.ts is the only file allowed to build an rgba string, and from a raw colour', () => {
    const veil = readFileSync(join(SRC, 'overlay', 'veil.ts'), 'utf8');
    expect(veil).toContain('raw.color.ink900');
    expect(veil).toContain('function dim');
    for (const file of files) {
      if (file.endsWith('veil.ts') || file.endsWith('layer.ts')) continue;
      const code = readFileSync(file, 'utf8');
      expect(code, `${relative(SRC, file)} builds colours from channels`).not.toMatch(/parseInt\(hex/);
    }
  });
});
