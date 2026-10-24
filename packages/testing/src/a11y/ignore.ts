import type { Violation } from './checks.js';

/**
 * Suppressions that have to justify themselves.
 *
 * An ignore list is the part of an a11y harness that can quietly undo the harness. Two decisions make
 * that impossible here:
 *  1. A suppression with no reason is a hard error at construction time. `""`, `"TODO"` and friends
 *     are rejected, because the reason is the only artefact that lets a reviewer later say "that
 *     reason stopped being true in March".
 *  2. A suppression that matched nothing is REPORTED by `audit()`. Stale ignores are how a fixed
 *     violation gets frozen: the rule goes green and the markup rots behind the ignore.
 *
 * Two mechanisms, because a component and a suite need different ones:
 *  - `data-a11y-ignore="rule"` + `data-a11y-ignore-reason="..."` on the element, for a component that
 *    knowingly renders this way;
 *  - a programmatic list, for a suite auditing a work-in-progress surface.
 */

export const IGNORE_ATTRIBUTE = 'data-a11y-ignore';
export const IGNORE_REASON_ATTRIBUTE = 'data-a11y-ignore-reason';

export interface IgnoreEntry {
  readonly rule: string;
  /** Scope: a selector within the audited tree, or the element itself. */
  readonly selector?: string;
  readonly element?: Element;
  /** Required and checked. */
  readonly reason: string;
  /** True for a blanket rule suppression; always shown in the report header. */
  readonly blanket?: boolean;
}

const REJECTED_REASONS = new Set(['todo', 'tbd', 'n/a', 'na', 'fix', 'later', 'ignore', 'test', 'x']);

export function isRealReason(reason: string): boolean {
  const normalised = reason.trim().toLowerCase();
  if (normalised.length < 12) return false;
  return !REJECTED_REASONS.has(normalised);
}

export function validateEntry(entry: IgnoreEntry): IgnoreEntry {
  if (!isRealReason(entry.reason)) {
    throw new Error(
      `[testing/a11y] ignore for "${entry.rule}" needs a real reason (got "${entry.reason}"). ` +
        'Minimum 12 characters, and not a placeholder like "TODO".',
    );
  }
  if (entry.blanket !== true && entry.element === undefined && entry.selector === undefined) {
    throw new Error(
      `[testing/a11y] ignore for "${entry.rule}" names neither a selector nor an element. ` +
        'Whole-rule suppression goes through ignoreRule(), which the report shows as a header line.',
    );
  }
  return entry;
}

/** Explicit whole-rule suppression, kept separate so it stays visible in the report header. */
export function ignoreRule(rule: string, reason: string): IgnoreEntry {
  return validateEntry({ rule, reason, blanket: true });
}

export class IgnoreList {
  private readonly entries: IgnoreEntry[];
  private readonly matched = new Set<IgnoreEntry>();

  constructor(entries: readonly IgnoreEntry[] = []) {
    this.entries = entries.map(validateEntry);
  }

  get size(): number {
    return this.entries.length;
  }

  all(): readonly IgnoreEntry[] {
    return this.entries;
  }

  blanket(): readonly IgnoreEntry[] {
    return this.entries.filter((entry) => entry.blanket === true);
  }

  /** True when suppressed. Marks the entry matched so `stale()` can find the ones that never fired. */
  matches(violation: Violation, root: Element): boolean {
    for (const entry of this.entries) {
      if (entry.rule !== violation.rule && entry.rule !== '*') continue;
      if (entry.blanket === true) {
        this.matched.add(entry);
        return true;
      }
      if (entry.element !== undefined) {
        if (entry.element !== violation.element && !entry.element.contains(violation.element)) continue;
        this.matched.add(entry);
        return true;
      }
      if (entry.selector !== undefined) {
        const inside = Array.from(root.querySelectorAll(entry.selector)).includes(violation.element);
        if (!inside && !root.matches(entry.selector)) continue;
        this.matched.add(entry);
        return true;
      }
    }
    return false;
  }

  /** Entries that never fired — `audit()` surfaces them so an ignore cannot outlive its purpose. */
  stale(): IgnoreEntry[] {
    return this.entries.filter((entry) => !this.matched.has(entry));
  }

  /** Element-level `data-a11y-ignore` attributes found in the tree, validated as it collects. */
  static fromTree(root: Element): IgnoreEntry[] {
    const found: IgnoreEntry[] = [];
    const nodes = [root, ...Array.from(root.querySelectorAll(`[${IGNORE_ATTRIBUTE}]`))];
    for (const el of nodes) {
      const rules = el.getAttribute(IGNORE_ATTRIBUTE);
      if (rules === null || rules.trim() === '') continue;
      const reason = el.getAttribute(IGNORE_REASON_ATTRIBUTE) ?? '';
      for (const rule of rules.split(/[,\s]+/).filter(Boolean)) {
        found.push(validateEntry({ rule, element: el, reason }));
      }
    }
    return found;
  }

  /** The combined view an audit uses: the caller's list plus whatever the markup declares. */
  withTreeIgnores(root: Element): IgnoreList {
    return new IgnoreList([...this.entries, ...IgnoreList.fromTree(root)]);
  }
}

/**
 * Element-level ignores are read through this helper rather than by trusting the attribute's mere
 * presence, so a `data-a11y-ignore` with no reason throws at audit time instead of silently muting a
 * rule for the whole subtree.
 */
export function elementIgnoreRules(el: Element): { rule: string; reason: string }[] {
  const out: { rule: string; reason: string }[] = [];
  let current: Element | null = el;
  while (current !== null) {
    const declared = current.getAttribute(IGNORE_ATTRIBUTE);
    if (declared !== null && declared.trim() !== '') {
      const reason = current.getAttribute(IGNORE_REASON_ATTRIBUTE) ?? '';
      if (!isRealReason(reason)) {
        throw new Error(
          `[testing/a11y] ${IGNORE_ATTRIBUTE}="${declared}" has no usable ${IGNORE_REASON_ATTRIBUTE}. ` +
            'A suppression without a reason is how a violation becomes architecture.',
        );
      }
      for (const rule of declared.split(/[,\s]+/).filter(Boolean)) out.push({ rule, reason });
    }
    current = current.parentElement;
  }
  return out;
}
