/**
 * `--self-test`: build a throwaway fixture tree, prove the clean control passes, then inject one
 * violation per rule into a fresh copy and prove each one is caught by name.
 *
 * The real repository is never read or written. A guard that has never caught anything is
 * indistinguishable from a guard that cannot fire; this is the cheapest way to tell the difference.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkTree } from './checker.js';
import { INJECTIONS, removeTree, writeControlTree } from './fixture.js';
import { RULE_BY_ID } from './rules.js';

export interface SelfTestOutcome {
  readonly code: number;
  readonly lines: readonly string[];
}

function describeViolation(file: string, line: number, message: string): string {
  return `${file}:${line} — ${message}`;
}

export function runSelfTest(): SelfTestOutcome {
  const lines: string[] = [];
  const parent = mkdtempSync(join(tmpdir(), 'nastech-tree-conformance-selftest-'));
  let failures = 0;
  let caught = 0;

  try {
    const control = join(parent, 'control');
    writeControlTree(control);
    const clean = checkTree(control);
    if (clean.violations.length === 0) {
      lines.push(`clean control: passed — 0 violations (${clean.apps} apps, ${clean.packages} packages, ${clean.files} source files)`);
    } else {
      failures += 1;
      lines.push(`clean control: FAILED — expected 0 violations, got ${clean.violations.length}:`);
      for (const v of clean.violations) {
        lines.push(`  [${v.rule}] ${v.ruleName}  ${describeViolation(v.file, v.line, v.message)}`);
      }
    }

    for (const injection of INJECTIONS) {
      const dir = join(parent, `inject-${injection.rule}`);
      writeControlTree(dir);
      injection.inject(dir);
      const result = checkTree(dir);
      const ruleName = RULE_BY_ID.get(injection.rule)?.name ?? `rule-${injection.rule}`;
      const own = result.violations.filter((v) => v.rule === injection.rule);
      const extra = result.violations.filter((v) => v.rule !== injection.rule);
      const exact = own.length === 1 && extra.length === 0;
      if (exact) {
        caught += 1;
        const hit = own[0]!;
        lines.push(
          `[${injection.rule}] ${ruleName}: caught 1 — ${injection.name} at ${describeViolation(hit.file, hit.line, hit.message)}`,
        );
      } else {
        failures += 1;
        lines.push(
          `[${injection.rule}] ${ruleName}: MISSED — ${injection.name}; expected exactly 1 violation of rule ${injection.rule}, got ${own.length} and ${extra.length} other-rule violation(s)`,
        );
        for (const v of result.violations) {
          lines.push(`    saw [${v.rule}] ${v.ruleName}  ${describeViolation(v.file, v.line, v.message)}`);
        }
      }
      removeTree(dir);
    }
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }

  if (failures === 0 && caught === INJECTIONS.length) {
    lines.push(`SELF-TEST OK — ${caught}/${INJECTIONS.length} injections caught by name, clean control passed.`);
    return { code: 0, lines };
  }
  lines.push(`SELF-TEST FAILED — ${caught}/${INJECTIONS.length} injections caught, ${failures} failure(s). This gate does not see what it claims to prevent.`);
  return { code: 1, lines };
}
