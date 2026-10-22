import { describe, expect, test } from 'bun:test';
import type { AssetManifest, ClaimScope, LodTier, Rendition } from '@nastech/api-contracts';
import { budgets } from '@nastech/api-contracts';
import { CaptureError } from '../errors.js';
import { buildManifest, narrowerScope, scopeWidth, type CaptionDraft, type ManifestBuildInput } from '../manifest-build.js';
import { runAutoQc, type QcMeasurements, type QcReport } from '../auto-qc.js';
import type { ProducedRendition } from '../rendition-gen.js';
import { BUCKET_PREFIX } from '../upload.js';
import { allRenditions, checkPublishedAsset, formatBudgetReport, requireWithinBudget } from '../budget-check.js';

const clean: QcMeasurements = {
  frameCount: 48,
  sharpnessScore: 0.61,
  exposureMean: 0.52,
  highlightClipFraction: 0.004,
  holeCount: 0,
  nonManifoldCount: 1,
  textureBleedRatio: 0.002,
  silhouetteIou: 0.96,
};

function report(sabotage: Partial<QcMeasurements> = {}, aligned = true): QcReport {
  return runAutoQc({ ...clean, ...sabotage }, { aligned, measuredAt: '2026-04-01T09:00:00.000Z' });
}

function produced(lod: LodTier, bytes: number, sha256 = 'a'.repeat(64)): ProducedRendition {
  const poster = lod === 'poster';
  return {
    id: `ren_ast_017_v1_${lod}`,
    kind: poster ? 'POSTER' : 'MODEL',
    lod,
    mime: poster ? 'image/jpeg' : 'model/gltf-binary',
    path: `/studio/out/ast_017.v1.${lod}.${poster ? 'jpg' : 'glb'}`,
    bytes,
    sha256,
    fromTool: poster ? 'blender' : 'gltf-transform',
  };
}

const caption = (over: Partial<CaptionDraft> = {}): CaptionDraft => ({
  hotspotId: 'hs_bezel',
  position: [0.019, 0.004, 0],
  disclosureText: 'One hairline at 2 o’clock on the bezel, visible under raking light only.',
  severity: 'cosmetic',
  disclosureId: 'dis_001',
  ...over,
});

function input(over: Partial<ManifestBuildInput> = {}): ManifestBuildInput {
  const models = [produced('lod0', 2_000_000), produced('lod1', 800_000), produced('lod2', 300_000)];
  return {
    assetId: 'ast_017',
    listingId: 'lst_01',
    version: 1,
    models,
    poster: produced('poster', 180_000, 'b'.repeat(64)),
    metricScaleMetersPerUnit: 0.010125,
    qc: report(),
    captions: [caption()],
    ...over,
  };
}

describe('manifest assembly', () => {
  test('with no recorded human decision, the scope is exactly what the evidence earned', () => {
    const manifest = buildManifest(input());
    expect(manifest.claimScope).toBe('geometry_and_external_condition');
    const narrower = buildManifest(input({ qc: report({ sharpnessScore: 0.05 }) }));
    expect(narrower.claimScope).toBe('condition_only');
    const decoration = buildManifest(input({ qc: report({ holeCount: 5 }), captions: [] }));
    expect(decoration.claimScope).toBe('none');
  });

  test('scope can never exceed the evidence, for every supported-by-requested pair', () => {
    const supports: readonly ClaimScope[] = ['none', 'condition_only', 'geometry_and_external_condition'];
    const asks: readonly ClaimScope[] = ['none', 'condition_only', 'geometry_and_external_condition'];
    const qcFor = { none: report({ holeCount: 5 }), condition_only: report({ sharpnessScore: 0.05 }), geometry_and_external_condition: report() } as const;
    for (const supported of supports) {
      for (const ask of asks) {
        const base = input({ qc: qcFor[supported], captions: supported === 'none' ? [] : [caption()] });
        const build = () =>
          buildManifest({
            ...base,
            humanWiden: { to: ask, actor: 'officer_thandi', custodyRef: 'custody.jsonl#job_1#7' },
          });
        if (scopeWidth(ask) > scopeWidth(supported)) {
          let caught: unknown;
          try {
            build();
          } catch (error) {
            caught = error;
          }
          expect((caught as CaptureError).code).toBe('scope_exceeds_evidence');
          expect((caught as CaptureError).exitCode).not.toBe(0);
        } else {
          const manifest = build();
          expect(scopeWidth(manifest.claimScope)).toBe(scopeWidth(ask));
          expect(scopeWidth(manifest.claimScope)).toBeLessThanOrEqual(scopeWidth(supported));
        }
      }
    }
  });

  test('a scope decision with nobody attached to it is not a decision', () => {
    expect(() =>
      buildManifest({
        ...input(),
        humanWiden: { to: 'condition_only', actor: '  ', custodyRef: 'custody.jsonl#job_1#7' },
      }),
    ).toThrow(CaptureError);
    expect(() =>
      buildManifest({
        ...input(),
        humanWiden: { to: 'condition_only', actor: 'officer_thandi', custodyRef: '' },
      }),
    ).toThrow(CaptureError);
  });

  test('a rendition with no honest byte count stops the manifest', () => {
    for (const bytes of [0, -1, 1_500_000.5, Number.NaN]) {
      let caught: unknown;
      try {
        buildManifest(input({ models: [produced('lod0', bytes)] }));
      } catch (error) {
        caught = error;
      }
      expect((caught as CaptureError).code).toBe('rendition_size_missing');
    }
    expect(() => buildManifest(input({ poster: produced('poster', 180_000, 'dev') }))).toThrow(CaptureError);
  });

  test('a condition claim with no text behind it is refused', () => {
    expect(() => buildManifest(input({ captions: [] }))).toThrow(CaptureError);
    expect(() => buildManifest(input({ captions: [caption({ disclosureId: '  ' })] }))).toThrow(CaptureError);
    expect(() => buildManifest(input({ captions: [caption({ disclosureText: '' })] }))).toThrow(CaptureError);
    expect(() => buildManifest(input({ captions: [caption({ position: [Number.NaN, 0, 0] })] }))).toThrow(CaptureError);
  });

  test('no metric scale means no manifest — an unscaled model quietly implies a size', () => {
    for (const scale of [0, -1, Number.NaN]) {
      expect(() => buildManifest(input({ metricScaleMetersPerUnit: scale }))).toThrow(CaptureError);
    }
  });

  test('a model is never allowed to wear the poster tier', () => {
    expect(() => buildManifest(input({ models: [produced('poster', 100_000)] }))).toThrow(CaptureError);
  });

  test('every file a client can fetch is listed with a size and a private key', () => {
    const manifest = buildManifest(
      input({
        sprite: { id: 'ren_ast_017_v1_sprite', kind: 'SPRITE', path: '/studio/out/strip.jpg', bytes: 320_000, sha256: 'c'.repeat(64), frames: 12, widthPx: 3072, heightPx: 256 },
      }),
    );
    const ids = manifest.renditions.map((r) => r.id);
    expect(ids).toContain(manifest.poster.id);
    expect(ids).toContain(manifest.sprite!.id);
    expect(manifest.renditions.length).toBe(5);
    for (const rendition of manifest.renditions) {
      expect(rendition.bucketKey.startsWith(`${BUCKET_PREFIX}/ast_017/v1/`)).toBe(true);
      expect(rendition.bytes).toBeGreaterThan(0);
      expect(rendition.sha256.startsWith('sha256:')).toBe(true);
    }
    expect(manifest.renditions.find((r) => r.kind === 'SPRITE')!.frames).toBe(12);
    // lod0 first: the client's selection sorts on this list.
    expect(manifest.renditions.filter((r) => r.kind === 'MODEL').map((r) => r.lod)).toEqual(['lod0', 'lod1', 'lod2']);
  });

  test('a turntable strip with no frames is refused', () => {
    expect(() =>
      buildManifest(
        input({ sprite: { id: 'ren_x_sprite', kind: 'SPRITE', path: '/studio/out/strip.jpg', bytes: 100, sha256: 'd'.repeat(64), frames: 0, widthPx: 0, heightPx: 0 } }),
      ),
    ).toThrow(CaptureError);
  });

  test('the manifest checksum moves when the bytes it describes move', () => {
    const first = buildManifest(input());
    const swapped = buildManifest(input({ models: [produced('lod0', 1_999_999), produced('lod1', 800_000), produced('lod2', 300_000)] }));
    expect(first.checksum).not.toBe(swapped.checksum);
    expect(first.checksum.startsWith('sha256:')).toBe(true);
    const identical = buildManifest(input());
    expect(identical.checksum).toBe(first.checksum);
  });

  test('an asset version is never edited: the key is version-scoped', () => {
    const v1 = buildManifest(input({ version: 1 }));
    const v2 = buildManifest(input({ version: 2 }));
    expect(v2.renditions[0]!.bucketKey).toInclude('/v2/');
    expect(v1.renditions[0]!.bucketKey).toInclude('/v1/');
    expect(v2.renditions[0]!.bucketKey).not.toBe(v1.renditions[0]!.bucketKey);
  });

  test('narrowerScope picks the weaker claim, which is what the evidence rule needs', () => {
    expect(narrowerScope('geometry_and_external_condition', 'condition_only')).toBe('condition_only');
    expect(narrowerScope('none', 'geometry_and_external_condition')).toBe('none');
  });

  test('a manifest built from honest input stays inside every declared ceiling', () => {
    const manifest = buildManifest(input());
    for (const rendition of manifest.renditions) {
      expect(rendition.bytes).toBeLessThanOrEqual(budgets.sceneLodMaxBytes);
    }
  });
});

describe('budget gate on a published asset', () => {
  test('a conforming asset passes and reports the totals the CI log needs', () => {
    const budgetReport = checkPublishedAsset(buildManifest(input()));
    expect(budgetReport.ok).toBe(true);
    expect(budgetReport.violations).toEqual([]);
    expect(budgetReport.totals.modelCount).toBe(3);
    expect(budgetReport.totals.largestModelBytes).toBe(2_000_000);
    expect(budgetReport.totals.posterBytes).toBe(180_000);
    expect(budgetReport.totals.inspectionDownloadBytes).toBe(2_180_000);
  });

  test('a rendition with no size fails the gate that protects the byte guard', () => {
    const manifest = withRendition(buildManifest(input()), (r) => (r.lod === 'lod2' ? { ...r, bytes: 0 } : r));
    const budgetReport = checkPublishedAsset(manifest);
    expect(budgetReport.ok).toBe(false);
    expect(budgetReport.violations.map((v) => v.code)).toContain('size_missing');
    let caught: unknown;
    try {
      requireWithinBudget(budgetReport);
    } catch (error) {
      caught = error;
    }
    expect((caught as CaptureError).code).toBe('rendition_size_missing');
    expect((caught as CaptureError).exitCode).not.toBe(0);
  });

  test('a model over the ceiling is refused against the budget name it broke', () => {
    const manifest = withRendition(buildManifest(input()), (r) => (r.lod === 'lod0' ? { ...r, bytes: budgets.sceneLodMaxBytes + 1 } : r));
    const budgetReport = checkPublishedAsset(manifest);
    const violation = budgetReport.violations.find((v) => v.code === 'model_over_ceiling')!;
    expect(violations(budgetReport)).toContain('model_over_ceiling');
    expect(violation.budgetName).toBe('sceneLodMaxBytes');
    expect(violation.limitBytes).toBe(budgets.sceneLodMaxBytes);
    expect(formatBudgetReport(budgetReport)).toInclude('sceneLodMaxBytes');
    let caught: unknown;
    try {
      requireWithinBudget(budgetReport);
    } catch (error) {
      caught = error;
    }
    expect((caught as CaptureError).code).toBe('budget_exceeded');
    expect((caught as CaptureError).exitCode).not.toBe(0);
  });

  test('a public bucket key is refused: capture evidence has no public write path', () => {
    const manifest = withRendition(buildManifest(input()), (r) => ({ ...r, bucketKey: r.bucketKey.replace('private/media', 'public/assets') }));
    expect(violations(checkPublishedAsset(manifest))).toContain('key_not_private');
  });

  test('a poster that hides in the side field escapes every size check, so it is a violation', () => {
    const manifest = buildManifest(input());
    const unlisted: AssetManifest = { ...manifest, renditions: manifest.renditions.filter((r) => r.kind !== 'POSTER') };
    expect(allRenditions(unlisted).map((r) => r.id)).toContain(unlisted.poster.id);
    expect(violations(checkPublishedAsset(unlisted))).toContain('poster_not_listed');
  });

  test('a placeholder digest is refused, so the dev fixtures could never pass here', () => {
    const manifest = withRendition(buildManifest(input()), (r) => ({ ...r, sha256: 'sha256:8c0e…dev' }));
    expect(violations(checkPublishedAsset(manifest))).toContain('digest_missing');
  });

  test('an unknown claim scope has no disclosure sentence, which is caught', () => {
    const manifest = { ...buildManifest(input()), claimScope: 'geometry_and_condition_and_more' as unknown as ClaimScope };
    expect(violations(checkPublishedAsset(manifest))).toContain('scope_unknown');
  });

  test('a caption whose disclosure record vanished is caught at the gate too', () => {
    const manifest = { ...buildManifest(input()), captions: [{ ...caption(), disclosureId: '' }] };
    expect(violations(checkPublishedAsset(manifest))).toContain('caption_without_disclosure');
  });

  test('two renditions sharing an id cannot be addressed, so the asset is not publishable', () => {
    const manifest = buildManifest(input());
    const duplicated: AssetManifest = { ...manifest, renditions: [...manifest.renditions, manifest.renditions[0]!] };
    expect(violations(checkPublishedAsset(duplicated))).toContain('duplicate_rendition_id');
  });

  test('a missing metric scale fails the gate that guards the size claim', () => {
    const manifest = { ...buildManifest(input()), metricScaleMetersPerUnit: 0 };
    expect(violations(checkPublishedAsset(manifest))).toContain('scale_missing');
  });

  test('every violation code makes requireWithinBudget throw a non-zero typed error', () => {
    const sabotages: readonly ((m: AssetManifest) => AssetManifest)[] = [
      (m) => withRendition(m, (r) => (r.lod === 'lod1' ? { ...r, bytes: 0 } : r)),
      (m) => withRendition(m, (r) => ({ ...r, sha256: 'sha256:dev' })),
      (m) => withRendition(m, (r) => (r.lod === 'lod0' ? { ...r, bytes: budgets.sceneLodMaxBytes + 10 } : r)),
      (m) => withRendition(m, (r) => ({ ...r, bucketKey: 'public/x' })),
      (m) => ({ ...m, renditions: [...m.renditions, m.renditions[0]!] }),
      (m) => ({ ...m, renditions: m.renditions.filter((r) => r.kind !== 'POSTER') }),
      (m) => ({ ...m, claimScope: 'everything' as unknown as ClaimScope }),
      (m) => ({ ...m, captions: [{ ...m.captions[0]!, disclosureId: '' }] }),
      (m) => ({ ...m, metricScaleMetersPerUnit: 0 }),
    ];
    const seen = new Set<string>();
    for (const sabotage of sabotages) {
      const budgetReport = checkPublishedAsset(sabotage(buildManifest(input())));
      expect(budgetReport.ok).toBe(false);
      for (const violation of budgetReport.violations) seen.add(violation.code);
      let caught: unknown;
      try {
        requireWithinBudget(budgetReport);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(CaptureError);
      expect((caught as CaptureError).exitCode).not.toBe(0);
    }
    // the whole declared vocabulary is reachable, so no violation is silently un-raised
    expect([...seen].sort()).toEqual(
      [
        'caption_without_disclosure',
        'digest_missing',
        'duplicate_rendition_id',
        'key_not_private',
        'model_over_ceiling',
        'poster_not_listed',
        'route_asset_over_ceiling',
        'scale_missing',
        'scope_unknown',
        'size_missing',
      ].sort(),
    );
  });
});

function violations(report: { violations: readonly { code: string }[] }): string[] {
  return report.violations.map((v) => v.code);
}

function withRendition(manifest: AssetManifest, edit: (r: Rendition) => Rendition): AssetManifest {
  const renditions = manifest.renditions.map(edit);
  const poster = edit(manifest.poster);
  return {
    ...manifest,
    renditions,
    poster,
    ...(manifest.sprite ? { sprite: edit(manifest.sprite) } : {}),
  };
}
