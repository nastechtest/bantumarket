/**
 * Tests for the tree-conformance gate.
 *
 * Every test builds its own temp tree. The repository is never the fixture, so a feature landing
 * while these tests run cannot make them flaky. The suite proves both directions the gate needs:
 * clean input exits 0, and each of the eight injections exits 1 with the violation's file and line.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { checkTree, runChecks } from '../src/checker.js';
import { runCli } from '../src/cli.js';
import { INJECTIONS, createControlTree, removeTree } from '../src/fixture.js';
import { RULES } from '../src/rules.js';

const TOOLING_DIR = resolve(import.meta.dir, '..');
const roots: string[] = [];

function control(): string {
  const root = createControlTree('nastech-tree-conformance-test-');
  roots.push(root);
  return root;
}

function write(root: string, rel: string, content: string): void {
  const abs = join(root, ...rel.split('/'));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
}

interface RunResult {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

function run(argv: readonly string[]): RunResult {
  const out: string[] = [];
  const err: string[] = [];
  const code = runCli(argv, TOOLING_DIR, {
    log: (line) => out.push(line),
    error: (line) => err.push(line),
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

function snapshot(dir: string): string[] {
  const entries: string[] = [];
  const walk = (current: string, prefix: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      entries.push(rel);
      if (entry.isDirectory()) walk(join(current, entry.name), rel);
    }
  };
  walk(dir, '');
  return entries.sort();
}

function bigSource(lines: number): string {
  const out: string[] = [];
  for (let i = 0; i < lines; i += 1) out.push(`export const row${String(i).padStart(3, '0')} = ${i};`);
  return `${out.join('\n')}\n`;
}

afterAll(() => {
  for (const root of roots) removeTree(root);
});

describe('clean control tree', () => {
  it('has no violations and the expected inventory', () => {
    const result = checkTree(control());
    expect(result.violations).toEqual([]);
    expect(result.apps).toBe(3);
    expect(result.packages).toBe(2);
    expect(result.files).toBe(18);
  });

  it('exits 0 through the CLI', () => {
    const { code, out, err } = run(['--root', control()]);
    expect(code).toBe(0);
    expect(err).toBe('');
    expect(out).toContain('OK — 0 violations across 8 rules');
  });
});

describe('one injection per rule', () => {
  for (const injection of INJECTIONS) {
    it(`rule ${injection.rule} catches '${injection.name}' and exits 1`, () => {
      const root = control();
      injection.inject(root);

      const result = checkTree(root);
      const own = result.violations.filter((v) => v.rule === injection.rule);
      const other = result.violations.filter((v) => v.rule !== injection.rule);
      expect(own).toHaveLength(1);
      expect(other).toEqual([]);

      const hit = own[0]!;
      expect(hit.line).toBeGreaterThanOrEqual(1);
      expect(hit.file.length).toBeGreaterThan(0);

      const cli = run(['--root', root]);
      expect(cli.code).toBe(1);
      expect(cli.err).toContain(`${hit.file}:${hit.line}`);
    });
  }

  it('covers all eight rule ids exactly once', () => {
    const ids = INJECTIONS.map((injection) => injection.rule).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(RULES.map((rule) => rule.id)).toEqual(ids);
  });
});

describe('rule 1: router inventory', () => {
  it('reports an app with no router and exits 1', () => {
    const root = control();
    rmSync(join(root, 'apps', 'web-seller', 'src', 'router.tsx'));
    const violations = runChecks(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.rule).toBe(1);
    expect(violations[0]!.file).toBe('apps/web-seller/src/router.tsx');
    expect(violations[0]!.message).toContain('no src/router.tsx');

    const cli = run(['--root', root]);
    expect(cli.code).toBe(1);
  });
});

describe('rule 4: package surface', () => {
  it('rejects a relative walk from an app into packages/x/src', () => {
    const root = control();
    write(
      root,
      'apps/web-public/src/features/home/leak.ts',
      `import { brand } from '../../../../../packages/tokens/src/index.js';\n\nexport const leak = brand;\n`,
    );
    const own = runChecks(root).filter((v) => v.rule === 4);
    expect(own).toHaveLength(1);
    expect(own[0]!.message).toContain('bypasses its exports map');
    expect(own[0]!.file).toBe('apps/web-public/src/features/home/leak.ts');
  });

  it('rejects a package importing an app', () => {
    const root = control();
    write(
      root,
      'packages/tokens/src/backwards.ts',
      `import { App } from '@nastech/web-public';\n\nexport const backwards = App;\n`,
    );
    const own = runChecks(root).filter((v) => v.rule === 4);
    expect(own).toHaveLength(1);
    expect(own[0]!.message).toContain('packages must never depend on apps');
  });
});

describe('rule 6: one main per route', () => {
  it('detects createElement("main") in a page module', () => {
    const root = control();
    write(
      root,
      'apps/web-public/src/routes/Home.tsx',
      `import { createElement } from 'react';
import type { RouteDef } from '../router.js';

export default function Home({ route }: { route: RouteDef }) {
  return createElement('section', null, createElement('main', null, route.path));
}
`,
    );
    const own = runChecks(root).filter((v) => v.rule === 6);
    expect(own).toHaveLength(1);
    expect(own[0]!.file).toBe('apps/web-public/src/routes/Home.tsx');
    expect(own[0]!.line).toBe(5);
  });
});

describe('rule 7: size budget', () => {
  it('fires over 600 lines unless a named exception covers the file', () => {
    const root = control();
    const rel = 'apps/web-public/src/features/home/big.ts';
    write(root, rel, bigSource(601));

    const before = runChecks(root).filter((v) => v.rule === 7);
    expect(before).toHaveLength(1);
    expect(before[0]!.file).toBe(rel);
    expect(before[0]!.line).toBe(601);

    const withException = checkTree(root, { sizeExceptions: { [rel]: 'test: named exception with owner' } });
    expect(withException.violations).toEqual([]);
  });
});

describe('rule 8: critical route proof', () => {
  it('does not accept a refusal test that never sets up the no-session state', () => {
    const root = control();
    write(
      root,
      'apps/web-public/src/features/auth/signin.guard.test.ts',
      `import { describe, expect, it } from 'bun:test';

describe('sign-in route guard', () => {
  it('refuses to render the form and redirects to sign-in', () => {
    expect('/sign-in').toContain('sign-in');
  });
});
`,
    );
    const own = runChecks(root).filter((v) => v.rule === 8);
    expect(own).toHaveLength(1);
    expect(own[0]!.message).toContain("critical route '/sign-in'");
    expect(own[0]!.file).toBe('apps/web-public/src/router.tsx');
  });
});

describe('determinism', () => {
  it('returns the same ordered violations on repeated runs', () => {
    const root = control();
    for (const injection of INJECTIONS) {
      if (injection.rule === 2 || injection.rule === 4 || injection.rule === 5) injection.inject(root);
    }
    const first = JSON.stringify(checkTree(root).violations);
    const second = JSON.stringify(checkTree(root).violations);
    expect(second).toBe(first);
    expect(JSON.stringify(runChecks(root))).toBe(first);
  });
});

describe('--self-test', () => {
  it('passes 8/8 on temp trees and writes nothing into the repository', () => {
    const before = snapshot(TOOLING_DIR);
    const { code, out, err } = run(['--self-test']);
    const after = snapshot(TOOLING_DIR);

    expect(code).toBe(0);
    expect(err).toBe('');
    expect(out).toContain('clean control: passed — 0 violations');
    expect(out).toContain('SELF-TEST OK — 8/8 injections caught by name, clean control passed.');
    expect(out.match(/caught 1 —/g) ?? []).toHaveLength(8);
    expect(after).toEqual(before);
  }, 30_000);
});

describe('CLI contract', () => {
  it('rejects unknown arguments with exit 2', () => {
    const { code, err } = run(['--not-a-flag']);
    expect(code).toBe(2);
    expect(err).toContain('unknown argument');
  });

  it('rejects a missing root directory with exit 1', () => {
    const { code, err } = run(['--root', join(TOOLING_DIR, 'does-not-exist')]);
    expect(code).toBe(1);
    expect(err).toContain('is not a directory');
  });
});
