import type { RenderResult } from '../render.js';
import { RULES, RULE_IDS, type Rule, type Violation } from './checks.js';
import { IgnoreList, elementIgnoreRules, type IgnoreEntry } from './ignore.js';
import { formatReport } from './reporter.js';

/**
 * The audit entry point: call it on any rendered tree.
 *
 * `audit(document.querySelector('#checkout'))`, `audit(render(<Card/>).container)`, or
 * `audit(screen.container, { rules: ['color-contrast'] })` all work, because a rule is a pure function
 * of an element and the audit is just iteration plus severity. Nothing here needs the harness's
 * `render()` — that matters, since the app suites already have their own mount and the whole point is
 * that they do not have to re-do it to get an accessibility result.
 *
 * Two things `audit()` decides that a caller should not have to re-implement per suite:
 *  - element-level `data-a11y-ignore` is honoured (and throws if it has no reason — see ignore.ts);
 *  - stale ignores and blanket suppressions come back as report warnings, because "0 violations" that
 *    was achieved by muting a rule is a different sentence from "0 violations".
 */

export interface AuditOptions {
  /** Run only these rule ids. Unknown ids throw: a typo in a rule list should not read as a pass. */
  readonly rules?: readonly string[];
  /** Run every rule except these. Also validated. */
  readonly exclude?: readonly string[];
  readonly ignore?: IgnoreList | readonly IgnoreEntry[];
  /** Label used in the failure message; defaults to the tree's selector. */
  readonly name?: string;
}

export interface AuditReport {
  readonly name: string;
  readonly findings: readonly Violation[];
  readonly suppressed: readonly Violation[];
  readonly staleIgnores: readonly IgnoreEntry[];
  readonly blanketIgnores: readonly IgnoreEntry[];
  readonly byRule: Readonly<Record<string, number>>;
  readonly rulesRun: readonly string[];
  readonly pass: boolean;
}

function asElement(subject: Element | RenderResult): Element {
  if ('container' in subject) return subject.container;
  return subject;
}

function resolveRules(options: AuditOptions): readonly Rule[] {
  const known = new Set<string>(RULE_IDS);
  const include = options.rules;
  const exclude = options.exclude;
  if (include !== undefined) {
    const unknown = include.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new Error(`[testing/a11y] unknown rule id(s): ${unknown.join(', ')}. Known: ${RULE_IDS.join(', ')}.`);
    }
    return RULES.filter((rule) => include.includes(rule.id));
  }
  if (exclude !== undefined) {
    const unknown = exclude.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new Error(`[testing/a11y] unknown rule id(s) in exclude: ${unknown.join(', ')}.`);
    }
    return RULES.filter((rule) => !exclude.includes(rule.id));
  }
  return RULES;
}

export function audit(subject: Element | RenderResult, options: AuditOptions = {}): AuditReport {
  const root = asElement(subject);
  const rules = resolveRules(options);
  const list = options.ignore instanceof IgnoreList ? options.ignore : new IgnoreList(options.ignore ?? []);
  const combined = list.withTreeIgnores(root);

  const raw: Violation[] = [];
  for (const rule of rules) raw.push(...rule.check(root));

  const findings: Violation[] = [];
  const suppressed: Violation[] = [];
  for (const violation of raw) {
    const fromMarkup = elementIgnoreRules(violation.element).some((entry) => entry.rule === violation.rule || entry.rule === '*');
    if (fromMarkup || combined.matches(violation, root)) suppressed.push(violation);
    else findings.push(violation);
  }

  const byRule: Record<string, number> = {};
  for (const rule of rules) {
    const count = findings.filter((finding) => finding.rule === rule.id).length;
    if (count > 0) byRule[rule.id] = count;
  }

  const report: AuditReport = {
    name: options.name ?? `a11y audit of ${root.tagName.toLowerCase()}`,
    findings,
    suppressed,
    staleIgnores: combined.stale(),
    blanketIgnores: combined.blanket(),
    byRule,
    rulesRun: rules.map((rule) => rule.id),
    pass: findings.length === 0,
  };
  return report;
}

/**
 * The assertion suites actually want: throws with the formatted report as the message, so a failure is
 * readable in the bun diff without a second command.
 */
export function assertAccessible(subject: Element | RenderResult, options: AuditOptions = {}): AuditReport {
  const report = audit(subject, options);
  if (!report.pass) {
    throw new Error(formatReport(report));
  }
  return report;
}

/** Rule ids, exported so a suite can prove it did not exclude anything. */
export function availableRules(): readonly string[] {
  return RULE_IDS;
}

export { IgnoreList };
export type { Violation, IgnoreEntry, Rule };
