import { budgets } from '@nastech/api-contracts';
import type { AssetManifest, Rendition } from '@nastech/api-contracts';
import { checkByteBudget, selectLod, type BudgetVerdict } from '../quality/lod-selection.js';

/**
 * The pre-flight byte guard (07 §4.2).
 *
 * It refuses *before* the request, using the sizes the manifest already declared. That ordering is
 * the whole point: a 3 MB download that is cancelled halfway still cost the buyer half of 3 MB and
 * left them with a partially-painted viewer. The guard means the transfer never starts, so a refusal
 * is free, and the buyer gets the complete static path instead of an incomplete scene.
 */

export type RefusalReason = 'over-budget' | 'undeclared-size';

export interface GuardVerdict {
  readonly allowed: false;
  readonly reason: RefusalReason;
  readonly renditionId: string;
  readonly bytes: number;
  readonly limitBytes: number;
  /** What the buyer is told. It has to name the alternative, not just the rejection. */
  readonly message: string;
}

export interface AllowVerdict {
  readonly allowed: true;
  readonly renditionId: string;
  readonly bytes: number;
  readonly verdict: BudgetVerdict;
}

export type RenditionGuard = AllowVerdict | GuardVerdict;

const MB = 1024 * 1024;

function describe(bytes: number): string {
  return `${(bytes / MB).toFixed(1)} MB`;
}

/**
 * Guards a single rendition against the declared ceiling. `bytes` is trusted only when it is a real
 * number: an asset whose size nobody measured is refused, because "unknown" is the one case where the
 * guard would otherwise guarantee nothing.
 */
export function guardRendition(rendition: Rendition, limitBytes: number = budgets.sceneLodMaxBytes): RenditionGuard {
  if (!Number.isFinite(rendition.bytes) || rendition.bytes <= 0) {
    return {
      allowed: false,
      reason: 'undeclared-size',
      renditionId: rendition.id,
      bytes: Number.isFinite(rendition.bytes) ? rendition.bytes : 0,
      limitBytes,
      message:
        `The 3D model for this item has no declared size, so it is not downloaded on a metered connection. ` +
        'The photographs and the written condition notes below are the full record for this item.',
    };
  }
  const verdict = checkByteBudget(rendition.bytes, limitBytes);
  if (verdict.ok) {
    return { allowed: true, renditionId: rendition.id, bytes: rendition.bytes, verdict };
  }
  return {
    allowed: false,
    reason: 'over-budget',
    renditionId: rendition.id,
    bytes: verdict.bytes,
    limitBytes: verdict.limitBytes,
    message:
      `This item's 3D model is ${describe(verdict.bytes)}, over the ${describe(verdict.limitBytes)} inspection budget, ` +
      'so it was not downloaded. The photographs and the written condition notes below are the full record for this item.',
  };
}

/** Same guard, applied to whatever the device would actually have been sent. */
export function guardManifest(
  manifest: AssetManifest,
  limitBytes: number = budgets.sceneLodMaxBytes,
): { readonly rendition: Rendition; readonly guard: RenditionGuard } {
  const decision = selectLod(manifest, limitBytes);
  return { rendition: decision.rendition, guard: guardRendition(decision.rendition, limitBytes) };
}

export interface PreflightResult {
  readonly guard: RenditionGuard;
  /** Only ever populated when the guard allowed the fetch, which is the point of the exercise. */
  readonly bytes?: number;
}

/**
 * The refusal-before-request seam. `send` is not reached when the guard refuses — a test asserts that
 * on the call count, because a guard that throws *after* issuing the request is not a guard.
 */
export async function preflightGeometry(
  rendition: Rendition,
  send: (rendition: Rendition, signal?: AbortSignal) => Promise<{ bytes?: number }>,
  options: { readonly limitBytes?: number; readonly signal?: AbortSignal } = {},
): Promise<PreflightResult> {
  const guard = guardRendition(rendition, options.limitBytes ?? budgets.sceneLodMaxBytes);
  if (!guard.allowed) return { guard };
  const response = await send(rendition, options.signal);
  // `bytes` is only ever present on the allowed path, and an explicit undefined is not a size.
  return typeof response.bytes === 'number' ? { guard, bytes: response.bytes } : { guard };
}
