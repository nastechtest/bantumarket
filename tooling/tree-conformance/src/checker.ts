/**
 * The structural gate: eight checks over one tree walk.
 *
 * This file is the orchestration only. The rules live in `checks/` so their failure messages stay
 * tied to one boundary and no single file becomes the thing rule 7 warns about.
 */

import { ruleAppIsolation, ruleFeatureIsolation, rulePackageDirection } from './checks/boundaries.js';
import { ruleCriticalRouteGuard, ruleOneMainPerRoute, ruleRouteCompleteness } from './checks/routes.js';
import { ruleNoAuthoredJs, ruleSizeBudget } from './checks/source.js';
import { buildContext, makeViolation, type Context, type Violation } from './context.js';
import { RULES, SIZE_EXCEPTIONS } from './rules.js';

export type { Violation } from './context.js';

export interface CheckOptions {
  /** Override the named size exceptions (used by tests); defaults to `SIZE_EXCEPTIONS`. */
  readonly sizeExceptions?: Readonly<Record<string, string>>;
}

export interface CheckResult {
  readonly violations: readonly Violation[];
  readonly apps: number;
  readonly packages: number;
  readonly files: number;
}

export function checkTree(root: string, options: CheckOptions = {}): CheckResult {
  const ctx: Context = buildContext(root);
  const exceptions = options.sizeExceptions ?? SIZE_EXCEPTIONS;
  const violations: Violation[] = [
    ...ruleRouteCompleteness(ctx),
    ...ruleFeatureIsolation(ctx),
    ...ruleAppIsolation(ctx),
    ...rulePackageDirection(ctx),
    ...ruleNoAuthoredJs(ctx),
    ...ruleOneMainPerRoute(ctx),
    ...ruleSizeBudget(ctx, exceptions),
    ...ruleCriticalRouteGuard(ctx),
  ];
  violations.sort((a, b) => {
    if (a.rule !== b.rule) return a.rule - b.rule;
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
  });
  return {
    violations,
    apps: ctx.apps.length,
    packages: ctx.packages.length,
    files: ctx.files.length,
  };
}

export function runChecks(root: string, options: CheckOptions = {}): Violation[] {
  return [...checkTree(root, options).violations];
}

/** A parse error is a structural failure of the gate itself: report it through rule 1 at line 1. */
export function configurationViolation(message: string): Violation {
  return makeViolation(1, 'tooling/tree-conformance/check.ts', 1, message);
}

export function rulesSummary(): string {
  return RULES.map((r) => `[${r.id}] ${r.name}`).join('\n');
}
