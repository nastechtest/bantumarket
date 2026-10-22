/**
 * The CI gate on a published asset.
 *
 * Two questions, in order of how much they cost to get wrong:
 *
 * 1. **does every rendition declare a size?** The client refuses a fetch *before* it starts, on the
 *    manifest's `bytes` field, because a 2.5 MB model on a 2 GB phone kills the tab rather than
 *    loading slowly. A rendition with a missing or zero size silently disables that guard, so this is
 *    a build failure and not a warning.
 * 2. **does it fit the ceilings?** Every ceiling is read from `budgets` in `@nastech/api-contracts`.
 *    Nothing here types a byte number, because a second copy of a budget is a budget that drifts.
 *
 * Also checked, because both are the "a render implies a check that did not happen" failure: a public
 * bucket key, and a model whose claimed scope has no written disclosure behind it.
 */

import { budgets, CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import type { AssetManifest, BudgetName, ClaimScope, Rendition } from '@nastech/api-contracts';
import { BUCKET_PREFIX } from './upload.js';
import { budgetExceeded, inputInvalid, renditionSizeMissing } from './errors.js';

export type ViolationCode =
  | 'size_missing'
  | 'digest_missing'
  | 'model_over_ceiling'
  | 'route_asset_over_ceiling'
  | 'key_not_private'
  | 'duplicate_rendition_id'
  | 'poster_not_listed'
  | 'scope_unknown'
  | 'caption_without_disclosure'
  | 'scale_missing';

export interface BudgetViolation {
  readonly code: ViolationCode;
  readonly renditionId: string;
  readonly detail: string;
  readonly measuredBytes?: number;
  readonly limitBytes?: number;
  readonly budgetName?: BudgetName;
}

export interface AssetTotals {
  readonly modelCount: number;
  readonly largestModelBytes: number;
  readonly posterBytes: number;
  readonly spriteBytes: number;
  /** The heaviest single-device download: one model, plus the static path it always fetches. */
  readonly inspectionDownloadBytes: number;
  readonly declaredBytes: number;
}

export interface BudgetReport {
  readonly ok: boolean;
  readonly assetId: string;
  readonly version: number;
  readonly claimScope: ClaimScope;
  readonly violations: readonly BudgetViolation[];
  readonly totals: AssetTotals;
}

const SHA256_RE = /^(?:sha256:)?[0-9a-f]{64}$/;
const SCOPES: readonly ClaimScope[] = ['geometry_and_external_condition', 'condition_only', 'none'];

/** The poster and sprite sit in dedicated fields as well as the list; both must be size-checked. */
export function allRenditions(manifest: AssetManifest): Rendition[] {
  const listed = [...manifest.renditions];
  for (const extra of [manifest.poster, manifest.sprite]) {
    if (extra && !listed.some((r) => r.id === extra.id)) listed.push(extra);
  }
  return listed;
}

function isSized(rendition: Rendition): boolean {
  return Number.isInteger(rendition.bytes) && rendition.bytes > 0;
}

export function checkPublishedAsset(manifest: AssetManifest): BudgetReport {
  const violations: BudgetViolation[] = [];
  const renditions = allRenditions(manifest);

  if (!Number.isFinite(manifest.metricScaleMetersPerUnit) || manifest.metricScaleMetersPerUnit <= 0) {
    violations.push({ code: 'scale_missing', renditionId: manifest.assetId, detail: `metricScaleMetersPerUnit is ${manifest.metricScaleMetersPerUnit}; every size claim in the captions rides on it.` });
  }

  if (!SCOPES.includes(manifest.claimScope) || !(manifest.claimScope in CLAIM_SCOPE_DISCLOSURE)) {
    violations.push({ code: 'scope_unknown', renditionId: manifest.assetId, detail: `claimScope "${manifest.claimScope}" is not a contract value, so no disclosure sentence exists for it.` });
  }

  for (const caption of manifest.captions) {
    if (!caption.disclosureId.trim() || !caption.disclosureText.trim()) {
      violations.push({
        code: 'caption_without_disclosure',
        renditionId: caption.hotspotId,
        detail: 'A condition caption with no disclosure record behind it: the dispute process reads text, and there is none.',
      });
    }
  }

  const seenIds = new Set<string>();
  for (const rendition of renditions) {
    if (seenIds.has(rendition.id)) {
      violations.push({ code: 'duplicate_rendition_id', renditionId: rendition.id, detail: 'Two renditions share an id, so the client cannot address one of them.' });
    }
    seenIds.add(rendition.id);

    if (!isSized(rendition)) {
      violations.push({
        code: 'size_missing',
        renditionId: rendition.id,
        detail: `bytes = ${rendition.bytes}. The pre-flight byte guard refuses on this field; without a size it fetches blind.`,
        measuredBytes: rendition.bytes,
      });
    }
    if (!SHA256_RE.test(rendition.sha256)) {
      violations.push({ code: 'digest_missing', renditionId: rendition.id, detail: `sha256 "${rendition.sha256}" is not a file digest, so the bytes served cannot be verified.` });
    }
    if (!rendition.bucketKey.startsWith(`${BUCKET_PREFIX}/`)) {
      violations.push({ code: 'key_not_private', renditionId: rendition.id, detail: `bucket key "${rendition.bucketKey}" is outside the private capture prefix.` });
    }
    if (rendition.kind === 'MODEL' && isSized(rendition) && rendition.bytes > budgets.sceneLodMaxBytes) {
      violations.push({
        code: 'model_over_ceiling',
        renditionId: rendition.id,
        detail: `${rendition.lod} exceeds the per-LOD ceiling.`,
        measuredBytes: rendition.bytes,
        limitBytes: budgets.sceneLodMaxBytes,
        budgetName: 'sceneLodMaxBytes',
      });
    }
  }

  // The poster is the static path and the fallback viewer reads it directly; if it is not in the
  // list, its size escapes every client-side guard that only walks `renditions`. Checked against the
  // manifest's own list, not `allRenditions`, which deliberately back-fills the side fields.
  const posterListed = manifest.renditions.some((r) => r.id === manifest.poster.id && r.kind === 'POSTER');
  if (!posterListed) {
    violations.push({ code: 'poster_not_listed', renditionId: manifest.poster.id, detail: 'The poster exists only as a side field, so nothing that walks renditions for sizes can see it.' });
  }

  const models = renditions.filter((r) => r.kind === 'MODEL');
  const largestModelBytes = models.reduce((max, r) => Math.max(max, isSized(r) ? r.bytes : 0), 0);
  const posterBytes = isSized(manifest.poster) ? manifest.poster.bytes : 0;
  const spriteBytes = manifest.sprite && isSized(manifest.sprite) ? manifest.sprite.bytes : 0;
  const declaredBytes = renditions.reduce((sum, r) => sum + (isSized(r) ? r.bytes : 0), 0);

  // The route-class ceiling is per download, not per asset: a device takes one LOD, and the poster
  // and turntable strip are the static path the page pays for whether or not a model exists.
  if (largestModelBytes > budgets.sceneAssetMb * 1024 * 1024) {
    violations.push({
      code: 'route_asset_over_ceiling',
      renditionId: models[0]?.id ?? manifest.assetId,
      detail: 'The finest model is larger than the whole ceiling the 3D inspection route class was granted.',
      measuredBytes: largestModelBytes,
      limitBytes: budgets.sceneAssetMb * 1024 * 1024,
      budgetName: 'sceneAssetMb',
    });
  }

  return {
    ok: violations.length === 0,
    assetId: manifest.assetId,
    version: manifest.version,
    claimScope: manifest.claimScope,
    violations: Object.freeze(violations),
    totals: {
      modelCount: models.length,
      largestModelBytes,
      posterBytes,
      spriteBytes,
      inspectionDownloadBytes: largestModelBytes + posterBytes + spriteBytes,
      declaredBytes,
    },
  };
}

/** Turns the report into the same typed failures the CLI prints, so CI and the operator see one vocabulary. */
export function requireWithinBudget(report: BudgetReport): void {
  const violation = report.violations[0];
  if (!violation) return;
  if (violation.budgetName !== undefined && violation.measuredBytes !== undefined && violation.limitBytes !== undefined) {
    throw budgetExceeded(violation.renditionId, violation.measuredBytes, violation.limitBytes, violation.budgetName);
  }
  if (violation.code === 'size_missing' || violation.code === 'digest_missing' || violation.code === 'scale_missing') {
    throw renditionSizeMissing(violation.renditionId, violation.detail);
  }
  // Everything left is a malformed manifest rather than an oversized one: it is the operator's input
  // that is wrong, and it needs the sentence that says which field.
  throw inputInvalid(
    `${violation.detail}`,
    `Fix the manifest (${violation.code}) before publishing; the client and the dispute process both read these fields.`,
    { code: violation.code, renditionId: violation.renditionId },
  );
}

export function formatBudgetReport(report: BudgetReport): string {
  const lines = [
    `asset ${report.assetId} v${report.version}  scope ${report.claimScope}`,
    `  models: ${report.totals.modelCount}  largest ${report.totals.largestModelBytes.toLocaleString('en-ZA')} B (ceiling ${budgets.sceneLodMaxBytes.toLocaleString('en-ZA')} B, sceneLodMaxBytes)`,
    `  poster ${report.totals.posterBytes.toLocaleString('en-ZA')} B  sprite ${report.totals.spriteBytes.toLocaleString('en-ZA')} B`,
    `  heaviest inspection download ${report.totals.inspectionDownloadBytes.toLocaleString('en-ZA')} B  (route ceiling ${budgets.sceneAssetMb} MB, sceneAssetMb)`,
    `  all declared bytes ${report.totals.declaredBytes.toLocaleString('en-ZA')} B`,
  ];
  if (report.ok) lines.push('  WITHIN BUDGET');
  else lines.push(...report.violations.map((v) => `  VIOLATION [${v.code}] ${v.renditionId}: ${v.detail}`));
  return lines.join('\n');
}
