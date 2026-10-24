/**
 * Rules 5 and 7: authored JavaScript and the review-size budget.
 */

import { makeViolation, type Context, type Violation } from '../context.js';
import { SIZE_LIMIT_LINES } from '../rules.js';
import { countLines } from '../scan.js';

export function ruleNoAuthoredJs(ctx: Context): Violation[] {
  const out: Violation[] = [];
  for (const file of ctx.files) {
    if (file.ext !== '.js' && file.ext !== '.jsx') continue;
    if (!file.rel.split('/').includes('src')) continue;
    out.push(
      makeViolation(
        5,
        file.rel,
        1,
        `authored ${file.ext} under src/; JavaScript is build output — author .ts/.tsx and keep generated files out of src`,
      ),
    );
  }
  return out;
}

export function ruleSizeBudget(ctx: Context, exceptions: Readonly<Record<string, string>>): Violation[] {
  const out: Violation[] = [];
  for (const file of ctx.files) {
    if (file.ext !== '.ts' && file.ext !== '.tsx') continue;
    if (!file.rel.split('/').includes('src')) continue;
    if (exceptions[file.rel] !== undefined) continue;
    let text: string;
    try {
      text = ctx.cache.read(file.abs);
    } catch {
      continue;
    }
    const lines = countLines(text);
    if (lines > SIZE_LIMIT_LINES) {
      out.push(
        makeViolation(
          7,
          file.rel,
          SIZE_LIMIT_LINES + 1,
          `file is ${lines} lines; limit is ${SIZE_LIMIT_LINES}. Split it or record a named exception in tooling/tree-conformance/src/rules.ts`,
        ),
      );
    }
  }
  return out;
}
