import type { AssetManifest, ConditionCaption, LodTier, Rendition, RenditionKind } from '@nastech/api-contracts';
import type { SourcedRendition } from './frame-strip.js';

/**
 * Test fixtures only. Shape comes from `@nastech/api-contracts`; nothing here invents a field, and
 * signed URLs are opaque paths on purpose — a fallback that could assemble a bucket URL would be the
 * bug the media endpoint exists to prevent.
 */

// Written out rather than `Partial<Rendition>` so an explicit `undefined` (meaning "this field is
// absent from the capture") stays legal under exactOptionalPropertyTypes.
interface SourcedOptions {
  readonly lod?: LodTier;
  readonly bytes?: number;
  readonly mime?: string;
  readonly widthPx?: number | undefined;
  readonly heightPx?: number | undefined;
  readonly frames?: number | undefined;
  readonly signedUrl?: string | undefined;
}

export function sourced(id: string, kind: RenditionKind, extra: SourcedOptions = {}): SourcedRendition {
  const { signedUrl, ...rest } = extra;
  // `signedUrl: undefined` is a deliberate case: the media fetch has not landed yet. An omitted key
  // is the ordinary case and gets a URL.
  const url = 'signedUrl' in extra ? signedUrl : `/signed/${id}`;
  return {
    id,
    kind,
    lod: kind === 'MODEL' ? 'lod1' : 'poster',
    bytes: 1_000,
    sha256: 'dev',
    bucketKey: 'private',
    mime: kind === 'MODEL' ? 'model/gltf-binary' : 'image/jpeg',
    ...rest,
    ...(url === undefined ? {} : { signedUrl: url }),
  } as SourcedRendition;
}

export function caption(
  id: string,
  severity: ConditionCaption['severity'],
  text: string,
  disclosureId = `dis_${id}`,
): ConditionCaption {
  return { hotspotId: id, position: [0.01, 0.004, 0], disclosureText: text, severity, disclosureId };
}

/**
 * `null` means "the capture produced none". A literal `undefined` in an override is not assignable to
 * an optional field under exactOptionalPropertyTypes, and a fixture that cannot express absence cannot
 * test the case where the sprite does not exist.
 */
export interface ManifestOverrides {
  readonly assetId?: string;
  readonly listingId?: string;
  readonly version?: number;
  readonly claimScope?: AssetManifest['claimScope'];
  readonly poster?: SourcedRendition | null;
  readonly sprite?: SourcedRendition | null;
  readonly renditions?: readonly SourcedRendition[];
  readonly captions?: readonly ConditionCaption[];
}

export function manifest(overrides: ManifestOverrides = {}): AssetManifest {
  const shape: Record<string, unknown> = {
    assetId: 'ast_01',
    listingId: 'lst_01',
    version: 3,
    checksum: 'sha256:dev',
    claimScope: 'geometry_and_external_condition',
    metricScaleMetersPerUnit: 0.0405,
    poster: sourced('ren_poster', 'POSTER', { widthPx: 1200, heightPx: 1200 }) as never,
    sprite: sourced('ren_sprite', 'SPRITE', { frames: 12, widthPx: 1440 }) as never,
    renditions: [sourced('ren_lod1', 'MODEL') as never],
    captions: [],
    ...overrides,
  };
  for (const key of ['poster', 'sprite'] as const) {
    if (shape[key] === null) delete shape[key];
  }
  return shape as unknown as AssetManifest;
}
