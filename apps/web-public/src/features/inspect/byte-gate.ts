import { budgets, type AssetManifest } from '@nastech/api-contracts';
import {
  budgetVerdictFor,
  checkByteBudget,
  selectLod,
  type BudgetVerdict,
  type LodDecision,
} from '@nastech/ui-3d/quality';

/**
 * Refuse the model bytes BEFORE the fetch (07 §4.2 / rule 1).
 *
 * `selectLod` picks the finest rendition that fits `sceneLodMaxBytes`, but a rendition whose bytes
 * still exceed the ceiling must be refused *now* — not downloaded slowly and not allowed to kill a
 * 2 GB tab. This gate is the one call that says "do not fetch" and hands back the reason so the
 * surface can render the complete static path with a one-line why, never a spinner.
 *
 * A budget number is never re-declared here: the ceiling is read from `@nastech/api-contracts`.
 */

export type ByteGate =
  | { readonly fetch: true; readonly lod: LodDecision; readonly bytes: number }
  | { readonly fetch: false; readonly lod: LodDecision; readonly bytes: number; readonly limitBytes: number };

export function gateBytes(manifest: AssetManifest, limitBytes: number = budgets.sceneLodMaxBytes): ByteGate {
  const lod = selectLod(manifest, limitBytes);
  const verdict: BudgetVerdict = budgetVerdictFor(lod, limitBytes);
  // A manifest with no MODEL rendition is not an over-budget case; it is "nothing to fetch", handled
  // by the caller's `no-model-rendition` reason. Here we only gate bytes that exist.
  if (lod.reason === 'no-rendition') {
    return { fetch: false, lod, bytes: lod.bytes, limitBytes };
  }
  const byteCheck = checkByteBudget(lod.bytes, limitBytes);
  if (byteCheck.ok) {
    return { fetch: true, lod, bytes: lod.bytes };
  }
  return { fetch: false, lod, bytes: lod.bytes, limitBytes: byteCheck.limitBytes };
}

/** Human bytes for the readout — MB with two decimals, the unit a buyer reasons in. */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(2)} MB`;
}
