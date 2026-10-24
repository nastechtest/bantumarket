/**
 * CLI for the tree-conformance gate.
 *
 * Exit codes: 0 clean, 1 violations or a check that could not run, 2 usage error. The same
 * `checkTree` powers `--self-test`, so a rule cannot be green in one path and red in another.
 */

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkTree, type CheckResult, type Violation } from './checker.js';
import { runSelfTest } from './self-test.js';
import { RULES } from './rules.js';

export interface CliArgs {
  readonly root: string | null;
  readonly selfTest: boolean;
  readonly verbose: boolean;
  readonly json: boolean;
}

export interface CliIo {
  log: (line: string) => void;
  error: (line: string) => void;
}

const defaultIo: CliIo = {
  log: (line) => console.log(line),
  error: (line) => console.error(line),
};

export function parseArgs(argv: readonly string[]): { readonly args: CliArgs } | { readonly error: string } {
  let root: string | null = null;
  let selfTest = false;
  let verbose = false;
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--self-test') selfTest = true;
    else if (arg === '--verbose') verbose = true;
    else if (arg === '--json') json = true;
    else if (arg === '--root') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) return { error: '--root needs a directory argument' };
      root = value;
      i += 1;
    } else if (arg.startsWith('--root=')) {
      const value = arg.slice('--root='.length);
      if (value === '') return { error: '--root needs a directory argument' };
      root = value;
    } else if (arg === '--help' || arg === '-h') {
      return { error: helpText() };
    } else {
      return { error: `unknown argument '${arg}'\n${helpText()}` };
    }
  }
  return { args: { root, selfTest, verbose, json } };
}

function helpText(): string {
  return [
    'usage: bun tooling/tree-conformance/check.ts [--root DIR] [--self-test] [--verbose] [--json]',
    '',
    '  --root DIR    audit DIR instead of the monorepo root (used by the fixture tests)',
    '  --self-test   build a temp fixture tree, inject one violation per rule, refuse OK unless all 8 are caught',
    '  --verbose     print app/package inventory and per-rule counts',
    '  --json        print the violation list as JSON',
  ].join('\n');
}

function countByRule(violations: readonly Violation[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const v of violations) counts.set(v.rule, (counts.get(v.rule) ?? 0) + 1);
  return counts;
}

function report(result: CheckResult, args: CliArgs, io: CliIo): number {
  const { violations } = result;
  const counts = countByRule(violations);

  if (args.json) {
    io.log(
      JSON.stringify(
        {
          apps: result.apps,
          packages: result.packages,
          files: result.files,
          rules: RULES.length,
          violations: violations.map((v) => ({ rule: v.rule, ruleName: v.ruleName, file: v.file, line: v.line, message: v.message })),
        },
        null,
        2,
      ),
    );
    return violations.length === 0 ? 0 : 1;
  }

  if (args.verbose) {
    io.log(`tree-conformance — ${result.apps} apps, ${result.packages} packages, ${result.files} source files, ${RULES.length} rules`);
  }

  if (violations.length === 0) {
    io.log(`OK — 0 violations across ${RULES.length} rules (${result.apps} apps, ${result.packages} packages, ${result.files} source files).`);
    return 0;
  }

  io.error(`FAIL — ${violations.length} violation(s) across ${counts.size} rule(s):`);
  for (const v of violations) {
    io.error(`  [${v.rule}] ${v.ruleName}  ${v.file}:${v.line}  ${v.message}`);
  }
  if (args.verbose) {
    io.error('  --- by rule ---');
    for (const rule of RULES) {
      const count = counts.get(rule.id) ?? 0;
      if (count > 0) io.error(`  [${rule.id}] ${rule.name}: ${count}`);
    }
  }
  return 1;
}

export function runCli(argv: readonly string[], toolingDir: string, io: CliIo = defaultIo): number {
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    io.error(parsed.error);
    return 2;
  }
  const { args } = parsed;

  if (args.selfTest) {
    const outcome = runSelfTest();
    for (const line of outcome.lines) {
      if (outcome.code === 0) io.log(line);
      else io.error(line);
    }
    return outcome.code;
  }

  const root = args.root === null ? resolve(toolingDir, '..', '..') : resolve(args.root);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    io.error(`tree-conformance: root '${root}' is not a directory`);
    return 1;
  }
  return report(checkTree(root), args, io);
}
