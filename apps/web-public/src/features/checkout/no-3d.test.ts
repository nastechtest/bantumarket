/**
 * The `critical` route class contract, tested from the inside out.
 *
 * Two independent proofs, because one can rot while the other still passes:
 *
 *  A. Source scan: every file this feature owns — plus `routes/Checkout.tsx`, the entry the
 *     router lazy-imports — is checked for ANY edge toward the scene runtime in ANY shape:
 *     static `import ... from`, bare `import 'x'`, dynamic `import('x')`, and `require('x')`.
 *     Forbidden: `three`, `@react-three/*` (any subpath), `@nastech/ui-3d/*` (any subpath —
 *     the task rule is stricter than the fence here: even the *static* ui-3d subpaths are
 *     banned on critical routes, and none of them belong in a payment screen).
 *
 *  B. The real fence: `scripts/check-3d-boundaries.ts` is run as the repo runs it, and any
 *     violation it reports for the `/checkout/:orderId` route fails this test. Other routes'
 *     violations belong to their owning agents and do not sink checkout.
 */

import { describe, it, expect } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const FEATURE_DIR = import.meta.dir;
const REPO_ROOT = join(FEATURE_DIR, '../../../../..');
const ROUTE_FILE = join(REPO_ROOT, 'apps/web-public/src/routes/Checkout.tsx');

const FORBIDDEN = [
  /^three$/,
  /^three\//,
  /^@react-three\/.*/,
  /^@nastech\/ui-3d(\/.*)?$/,
];

function isForbiddenSpecifier(spec: string): boolean {
  return FORBIDDEN.some((re) => re.test(spec));
}

/** The four shapes a specifier can arrive in (mirrors check-3d-boundaries.ts's own scanner). */
function specifiersOf(code: string): { spec: string; kind: 'static' | 'dynamic' | 'side-effect' | 'require' }[] {
  const out: { spec: string; kind: 'static' | 'dynamic' | 'side-effect' | 'require' }[] = [];
  const staticRe = /(?:^|[\s;}])(?:import|export)\s+[\s\S]*?\s*from\s*['"]([^'"]+)['"]/g;
  const bareRe = /(?:^|[\s;}])(?:import)\s*['"]([^'"]+)['"]/g;
  const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const reqRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of code.matchAll(staticRe)) out.push({ spec: m[1]!, kind: 'static' });
  for (const m of code.matchAll(bareRe)) out.push({ spec: m[1]!, kind: 'side-effect' });
  for (const m of code.matchAll(dynRe)) out.push({ spec: m[1]!, kind: 'dynamic' });
  for (const m of code.matchAll(reqRe)) out.push({ spec: m[1]!, kind: 'require' });
  return out;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    // This guard test necessarily contains the forbidden names as REGEX SOURCE; it is the only
    // file allowed to name them, the same way the fence script's self-test injects them.
    if (entry.name === 'no-3d.test.ts') return [];
    return [full];
  });
}

describe('no-3d: the critical checkout route never reaches the scene runtime', () => {
  const files = [...sourceFiles(FEATURE_DIR), ROUTE_FILE];

  it('scans the whole owned subtree (and would miss nothing new added to it)', () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  it('no file imports, side-effects, dynamically imports or requires three / @react-three/* / @nastech/ui-3d/*', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const edge of specifiersOf(src)) {
        if (isForbiddenSpecifier(edge.spec)) {
          offenders.push(`${relative(REPO_ROOT, file)}: ${edge.kind} import of '${edge.spec}'`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no file even mentions the runtime by name outside comments (typosquat guard)', () => {
    // A string constant like 'three' passed to a loader is how sneaky reachability starts.
    // Allowed: the words inside prose comments; forbidden: inside quotes as a value.
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const withoutComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
      const quoted = withoutComments.match(/['"](three|@react-three\/[^'"]*|@nastech\/ui-3d[^'"]*)['"]/g) ?? [];
      if (quoted.length > 0) offenders.push(`${relative(REPO_ROOT, file)}: ${quoted.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('the real build fence reports zero violations for the checkout route', () => {
    // `process.execPath` under `bun test` IS bun — the same interpreter the fence shebang wants,
    // typed by @types/node so the root tsconfig stays green without a Bun global.
    const proc = spawnSync(process.execPath, ['scripts/check-3d-boundaries.ts'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const out = `${proc.stdout ?? ''}${proc.stderr ?? ''}`;
    // The fence may be red for another agent's route mid-wave; checkout's own line must not be.
    const checkoutFail = out
      .split('\n')
      .some((line) => line.includes('/checkout/:orderId') && line.includes('['));
    expect(checkoutFail).toBe(false);
  });

  it('the router classifies /checkout/:orderId as critical (the class this test exists for)', () => {
    const routerSrc = readFileSync(join(REPO_ROOT, 'apps/web-public/src/router.tsx'), 'utf8');
    expect(routerSrc).toMatch(/path: '\/checkout\/:orderId', class: 'critical'/);
  });
});
