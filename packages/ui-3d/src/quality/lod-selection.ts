import { budgets } from '@nastech/api-contracts';
import type { AssetManifest, LodTier, Rendition } from '@nastech/api-contracts';

/**
 * LOD selection (07 §4.1 `quality/`). The client chooses against declared per-rendition sizes;
 * the server never guesses device class, because it cannot see the connection.
 */

export interface LodDecision {
  readonly tier: LodTier;
  readonly rendition: Rendition;
  readonly bytes: number;
  readonly reason: 'fits' | 'largest-fitting' | 'no-rendition';
}

const ORDER: readonly LodTier[] = ['lod0', 'lod1', 'lod2', 'poster'];

export function selectLod(manifest: AssetManifest, budgetBytes: number = budgets.sceneLodMaxBytes): LodDecision {
  const models = manifest.renditions
    .filter((r) => r.kind === 'MODEL')
    .sort((a, b) => ORDER.indexOf(a.lod) - ORDER.indexOf(b.lod));

  if (models.length === 0) {
    return { tier: 'poster', rendition: manifest.poster, bytes: manifest.poster.bytes, reason: 'no-rendition' };
  }

  const fitting = models.filter((r) => r.bytes <= budgetBytes);
  if (fitting.length > 0) {
    // `fitting` preserves the lod0-first order, so the first hit is the finest that fits.
    const chosen = fitting[0]!;
    return { tier: chosen.lod, rendition: chosen, bytes: chosen.bytes, reason: 'fits' };
  }

  const smallest = models.reduce((a, b) => (b.bytes < a.bytes ? b : a), models[0]!);
  return { tier: smallest.lod, rendition: smallest, bytes: smallest.bytes, reason: 'largest-fitting' };
}

/**
 * Pre-flight guard. This refuses BEFORE the request: a 2.5 MB asset on a 2 GB phone is not a slow
 * page, it is a killed tab. Returns the refusal reason so the caller can render the static path
 * and say why.
 */
export type BudgetVerdict = { ok: true; bytes: number } | { ok: false; bytes: number; limitBytes: number };

export function checkByteBudget(bytes: number, limitBytes: number = budgets.sceneLodMaxBytes): BudgetVerdict {
  if (bytes <= limitBytes) return { ok: true, bytes };
  return { ok: false, bytes, limitBytes };
}

export function budgetVerdictFor(decision: LodDecision, limitBytes: number = budgets.sceneLodMaxBytes): BudgetVerdict {
  return checkByteBudget(decision.bytes, limitBytes);
}
