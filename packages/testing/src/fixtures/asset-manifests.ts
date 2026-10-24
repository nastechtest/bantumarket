import type { AssetManifest, ClaimScope, ConditionCaption, Rendition } from '@nastech/api-contracts';
import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';

/**
 * Asset manifest builders and the manifest corpus.
 *
 * The shape is `@nastech/api-contracts`'s `AssetManifest` verbatim — nothing is re-declared here, and
 * the claim-scope strings come from `CLAIM_SCOPE_DISCLOSURE`, so a fixture that claims
 * `geometry_and_external_condition` carries exactly the sentence the product must render. That is the
 * point: other agents assert their UI against this text, and if the fixture invented its own wording
 * the test would pass while the disclosure stayed wrong.
 *
 * `packages/ui-3d/src/viewer/tests/fixtures.ts` already has builders of this kind for its own package
 * tests. They stay — a package's unit tests should not depend on the testing package (nothing
 * production-facing may import it) — and this file is the cross-app corpus they cannot serve: the
 * manifest *shapes* a buyer-facing surface has to branch on, each one named for the decision it
 * forces.
 */

const KB = 1024;
const MB = 1024 * KB;

export function rendition(overrides: Partial<Rendition> & Pick<Rendition, 'id' | 'kind' | 'lod' | 'bytes' | 'bucketKey' | 'mime'>): Rendition {
  return {
    sha256: `sha-${overrides.id}`,
    ...overrides,
  };
}

export function modelRendition(id: string, lod: 'lod0' | 'lod1' | 'lod2', bytes: number): Rendition {
  return rendition({ id, kind: 'MODEL', lod, bytes, bucketKey: `capture/${id}.glb`, mime: 'model/gltf-binary' });
}

export function posterRendition(bytes = 92 * KB): Rendition {
  return rendition({
    id: 'r-poster', kind: 'POSTER', lod: 'poster', bytes,
    bucketKey: 'capture/poster.webp', mime: 'image/webp', widthPx: 1200, heightPx: 1200,
  });
}

/** The 12-frame turntable the static path is built on. 12 is the product number, not a guess. */
export function spriteRendition(frames = 12, bytes = 240 * KB): Rendition {
  return rendition({
    id: 'r-sprite', kind: 'SPRITE', lod: 'poster', bytes,
    bucketKey: 'capture/turntable.webp', mime: 'image/webp',
    widthPx: 1200, heightPx: 1200, frames,
  });
}

export function caption(overrides: Partial<ConditionCaption> & Pick<ConditionCaption, 'hotspotId' | 'disclosureText'>): ConditionCaption {
  return {
    position: [0, 0, 0],
    severity: 'cosmetic',
    disclosureId: `D-${overrides.hotspotId}`,
    ...overrides,
  };
}

export interface ManifestOptions {
  readonly assetId?: string;
  readonly listingId?: string;
  readonly claimScope?: ClaimScope;
  readonly renditions?: readonly Rendition[];
  readonly poster?: Rendition;
  readonly sprite?: Rendition;
  readonly captions?: readonly ConditionCaption[];
  readonly version?: number;
  readonly metricScaleMetersPerUnit?: number;
}

export function makeManifest(options: ManifestOptions = {}): AssetManifest {
  const claimScope = options.claimScope ?? 'geometry_and_external_condition';
  const base: AssetManifest = {
    assetId: options.assetId ?? 'asset-1',
    listingId: options.listingId ?? 'listing-1',
    version: options.version ?? 3,
    checksum: `checksum-${options.assetId ?? 'asset-1'}`,
    claimScope,
    metricScaleMetersPerUnit: options.metricScaleMetersPerUnit ?? 0.02,
    renditions: options.renditions ?? [modelRendition('r-lod0', 'lod0', 1.8 * MB), modelRendition('r-lod1', 'lod1', 900 * KB)],
    poster: options.poster ?? posterRendition(),
    captions: options.captions ?? [],
  };
  // `exactOptionalPropertyTypes`: an absent sprite must be an absent key, not `sprite: undefined`,
  // or every `in`/`hasOwnProperty` check downstream sees a field the wire never sent.
  if (options.sprite !== undefined) return { ...base, sprite: options.sprite };
  return base;
}

/**
 * The named manifest scenarios. Each name is the decision a surface has to make, so a test reads as a
 * claim about behaviour rather than about data.
 */
export const MANIFEST_SCENARIOS: Readonly<Record<string, () => AssetManifest>> = {
  /** Full geometry capture: lod0 within budget, turntable, one functional disclosure. */
  fullCapture: () =>
    makeManifest({
      assetId: 'asset-full',
      listingId: 'seiko-5-full',
      claimScope: 'geometry_and_external_condition',
      sprite: spriteRendition(),
      captions: [
        caption({
          hotspotId: 'case-flank',
          position: [0.5, 0.02, 0.86],
          disclosureText: 'Hairline on the case flank, caught on a door frame.',
          severity: 'cosmetic',
          disclosureId: 'D-118',
        }),
        caption({
          hotspotId: 'clasp-stretch',
          position: [0.1, -0.05, 0.9],
          disclosureText: 'Clasp stretch: two links. The band holds, it is not a service issue.',
          severity: 'functional',
          disclosureId: 'D-119',
        }),
      ],
    }),

  /** Condition-only: the render shows wear, evidences nothing about shape fidelity. */
  conditionOnly: () =>
    makeManifest({
      assetId: 'asset-condition',
      listingId: 'citizen-eco-condition',
      claimScope: 'condition_only',
      renditions: [modelRendition('r-lod1', 'lod1', 780 * KB)],
      captions: [
        caption({
          hotspotId: 'bezel-scuff',
          disclosureText: 'Scuff on the bezel at 3 o\'clock, polished but not removed.',
          disclosureId: 'D-201',
        }),
      ],
    }),

  /** Decorative model: evidences nothing. The UI must not let it carry a condition claim. */
  decorative: () =>
    makeManifest({
      assetId: 'asset-decorative',
      listingId: 'casio-reference',
      claimScope: 'none',
      renditions: [modelRendition('r-lod2', 'lod2', 220 * KB)],
    }),

  /** Poster + turntable only. `planScene` must refuse it for the honest reason: no MODEL rendition. */
  posterAndTurntable: () =>
    makeManifest({
      assetId: 'asset-static',
      listingId: 'swatch-irony-static',
      claimScope: 'none',
      renditions: [],
      sprite: spriteRendition(),
      captions: [
        caption({
          hotspotId: 'strap-wear',
          disclosureText: 'Original strap showing everyday wear; buckle springs fine.',
          disclosureId: 'D-304',
        }),
      ],
    }),

  /** One lod0 above `budgets.sceneLodMaxBytes`: the byte guard refuses before the fetch starts. */
  overBudget: () =>
    makeManifest({
      assetId: 'asset-heavy',
      listingId: 'omega-heavy-overbudget',
      renditions: [modelRendition('r-lod0-heavy', 'lod0', 3.1 * MB)],
    }),

  /** lod0 busts a per-call budget while lod1 fits — the LOD-downgrade path. */
  lodFallback: () =>
    makeManifest({
      assetId: 'asset-lod-fallback',
      listingId: 'timex-lod-fallback',
      renditions: [modelRendition('r-lod0', 'lod0', 1.8 * MB), modelRendition('r-lod1', 'lod1', 640 * KB)],
    }),

  /** A capture with a disclosure the photographs cannot reach (under the case back). */
  unreachableDisclosure: () =>
    makeManifest({
      assetId: 'asset-unreachable',
      listingId: 'seiko-unreachable',
      captions: [
        caption({
          hotspotId: 'case-back',
          position: [0.2, -0.9, 0.35],
          disclosureText: 'Scratch across the case back. Captured before the case was opened.',
          severity: 'unknown',
          disclosureId: 'D-411',
        }),
      ],
    }),
};

/** Every claim scope, keyed by the scope itself — the corpus generator iterates this, never a literal list. */
export function manifestsByClaimScope(): Record<ClaimScope, AssetManifest> {
  const scopes: readonly ClaimScope[] = ['geometry_and_external_condition', 'condition_only', 'none'];
  return scopes.reduce<Record<ClaimScope, AssetManifest>>((acc, scope) => {
    acc[scope] = makeManifest({
      assetId: `asset-scope-${scope}`,
      listingId: `listing-scope-${scope}`,
      claimScope: scope,
      captions:
        scope === 'none'
          ? []
          : [caption({ hotspotId: `mark-${scope}`, disclosureText: CLAIM_SCOPE_DISCLOSURE[scope] })],
    });
    return acc;
  }, {} as Record<ClaimScope, AssetManifest>);
}
