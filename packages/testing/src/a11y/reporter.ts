import type { AuditReport } from './audit.js';
import type { Violation } from './checks.js';

/**
 * Report formatting, separated from the audit so a suite can print a report without re-running one and
 * so the shape of a failure message is a decision with one home.
 *
 * The format is line-oriented and grep-friendly on purpose: `grep -o '^\[[a-z-]*\]'` gives the rule
 * histogram, and every finding fits on one line so a bun diff stays readable. `toMarkdown` exists for
 * the gate reviews, where the same findings have to survive being pasted into a document.
 */

const SEVERITY_ORDER: readonly string[] = [
  'element-has-name',
  'control-has-label',
  'aria-hidden-focusable',
  'duplicate-id',
  'color-contrast',
  'aria-validity',
  'image-alt',
  'focus-visible',
  'heading-order',
  'no-unbacked-trust-claim',
  'claim-scope-is-text',
];

function severityRank(rule: string): number {
  const index = SEVERITY_ORDER.indexOf(rule);
  return index < 0 ? SEVERITY_ORDER.length : index;
}

/** Findings newest-rule-first by severity, then by selector so output is stable across runs. */
export function sorted(findings: readonly Violation[]): Violation[] {
  return [...findings].sort(
    (a, b) => severityRank(a.rule) - severityRank(b.rule) || a.selector.localeCompare(b.selector),
  );
}

export function summaryLine(report: AuditReport): string {
  const parts = [`${report.findings.length} violation(s)`, `${report.suppressed.length} suppressed`, `${report.rulesRun.length} rules run`];
  if (report.staleIgnores.length > 0) parts.push(`${report.staleIgnores.length} stale ignore(s)`);
  if (report.blanketIgnores.length > 0) parts.push(`${report.blanketIgnores.length} BLANKET ignore(s)`);
  return `${report.name}: ${parts.join(', ')}`;
}

/**
 * The human report. Stale and blanket ignores are printed even when the audit passed: those lines are
 * the difference between "this surface is accessible" and "this surface is not being checked", and the
 * second sentence has to be impossible to hide.
 */
export function formatReport(report: AuditReport): string {
  const lines: string[] = [summaryLine(report)];

  if (report.blanketIgnores.length > 0) {
    lines.push('', 'Blanket suppressions (the rule did not run for anything):');
    for (const entry of report.blanketIgnores) lines.push(`  [${entry.rule}] ${entry.reason}`);
  }
  if (report.staleIgnores.length > 0) {
    lines.push('', 'Stale ignores (no violation matched — delete these):');
    for (const entry of report.staleIgnores) {
      const scope = entry.selector ?? (entry.element !== undefined ? selectorTag(entry.element) : '(blanket)');
      lines.push(`  [${entry.rule}] ${scope} — ${entry.reason}`);
    }
  }

  if (report.findings.length === 0) {
    lines.push('', 'PASS');
    return lines.join('\n');
  }

  lines.push('');
  for (const finding of sorted(report.findings)) {
    lines.push(`[${finding.rule}] (${finding.wcag}) ${finding.selector}`);
    lines.push(`    ${finding.message}`);
  }
  lines.push('', `FAIL: ${report.findings.length} accessibility violation(s).`);
  return lines.join('\n');
}

function selectorTag(el: Element): string {
  return `${el.tagName.toLowerCase()}${el.getAttribute('id') !== null ? `#${el.getAttribute('id')}` : ''}`;
}

/** A gate-review table: one row per finding, rule + WCAG reference + selector + the fix hint. */
export function toMarkdown(report: AuditReport): string {
  const rows = sorted(report.findings).map(
    (finding) => `| ${finding.rule} | ${finding.wcag} | \`${finding.selector}\` | ${escapePipes(finding.message)} |`,
  );
  const header = '| Rule | WCAG | Element | Detail |\n| --- | --- | --- | --- |';
  const body = rows.length > 0 ? [header, ...rows].join('\n') : `${header}\n| — | — | — | no findings |`;
  return `${summaryLine(report)}\n\n${body}\n`;
}

function escapePipes(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** Rule histogram, for a suite that wants to assert "nothing new appeared" rather than "nothing exists". */
export function histogram(findings: readonly Violation[]): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const finding of findings) out[finding.rule] = (out[finding.rule] ?? 0) + 1;
  return out;
}

/**
 * A regression gate: pass today's findings with yesterday's baseline and it fails only on rules whose
 * count went UP. That is what lets a large app suite adopt the audit without a cleanup epic.
 */
export function regressionGate(
  current: readonly Violation[],
  baseline: Readonly<Record<string, number>>,
): { readonly ok: boolean; readonly worsened: readonly string[] } {
  const now = histogram(current);
  const worsened: string[] = [];
  for (const [rule, count] of Object.entries(now)) {
    if (count > (baseline[rule] ?? 0)) worsened.push(`${rule}: ${baseline[rule] ?? 0} → ${count}`);
  }
  return { ok: worsened.length === 0, worsened };
}
