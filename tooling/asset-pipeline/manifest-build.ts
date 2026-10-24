/**
 * Manifest assembly.
 *
 * This is where "a render is not evidence" becomes a mechanical rule instead of an intention. The
 * scope written into `AssetManifest.claimScope` is the narrowest of what the QC evidence supports and
 * what anyone asked for, and it starts from the evidence rather than from the request: the default
 * is whatever the gates earned, so a step that forgets to argue for a wider claim cannot end up with
 * one. Widening requires a named actor and a custody reference, because a scope that grew with
 * nobody attached to it is exactly the drift a dispute is built to catch.
 *
 * Every condition claim the render conveys has to exist as text with a `disclosureId`, since the
 * dispute process reads text and not pixels. A model claiming outer condition with no caption behind
 * it is refused here.
 */

import { createHash } from 'node:crypto';
import type {
  AssetManifest,
  ClaimScope,
  ConditionCaption,
  LodTier,
  Rendition,
} from '@nastech/api-contracts';
import { inputInvalid, renditionSizeMissing, scopeExceedsEvidence } from './errors.js';
import type { ProducedRendition } from './rendition-gen.js';
import { renditionId } from './rendition-gen.js';
import type { QcReport } from './auto-qc.js';
import { deriveRenditionKey } from './upload.js';

/** Ordered by how much a render is entitled to assert, narrowest first. */
const SCOPE_ORDER: readonly ClaimScope[] = ['none', 'condition_only', 'geometry_and_external_condition'];

export function scopeWidth(scope: ClaimScope): number {
  return SCOPE_ORDER.indexOf(scope);
}

export function narrowerScope(a: ClaimScope, b: ClaimScope): ClaimScope {
  return scopeWidth(a) <= scopeWidth(b) ? a : b;
}

export interface SpriteSpec {
  readonly id: string;
  readonly kind: 'SPRITE';
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly frames: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface CaptionDraft {
  readonly hotspotId: string;
  readonly position: readonly [number, number, number];
  readonly disclosureText: string;
  readonly severity: 'cosmetic' | 'functional' | 'unknown';
  readonly disclosureId: string;
}

export interface HumanWiden {
  readonly to: ClaimScope;
  /** The officer who made the call. A widening with no name attached is not a widening. */
  readonly actor: string;
  readonly custodyRef: string;
}

export interface ManifestBuildInput {
  readonly assetId: string;
  readonly listingId: string;
  readonly version: number;
  readonly models: readonly ProducedRendition[];
  readonly poster: ProducedRendition;
  readonly sprite?: SpriteSpec;
  readonly metricScaleMetersPerUnit: number;
  readonly qc: QcReport;
  readonly captions: readonly CaptionDraft[];
  readonly humanWiden?: HumanWiden;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

export function assertHonestRenditionSize(rendition: { id: string; bytes: number; sha256: string }): void {
  if (!Number.isInteger(rendition.bytes) || rendition.bytes <= 0) {
    throw renditionSizeMissing(rendition.id, `declared bytes = ${rendition.bytes}`);
  }
  if (!SHA256_HEX.test(rendition.sha256)) {
    throw renditionSizeMissing(rendition.id, 'sha256 is not the digest of a produced file');
  }
}

function toRendition(produced: ProducedRendition, assetId: string, version: number): Rendition {
  assertHonestRenditionSize(produced);
  // No pixel dimensions: the pipeline knows the bytes it hashed, not the resolution the render was
  // set to, and the contract leaves those fields optional rather than demanding a guess.
  return {
    id: produced.id,
    kind: produced.kind,
    lod: produced.lod,
    bytes: produced.bytes,
    sha256: `sha256:${produced.sha256}`,
    bucketKey: deriveRenditionKey({ assetId, version, lod: produced.lod, mime: produced.mime }),
    mime: produced.mime,
  };
}

const LOD_ORDER: readonly LodTier[] = ['lod0', 'lod1', 'lod2', 'poster'];

function assertCaption(caption: CaptionDraft, index: number): ConditionCaption {
  if (!caption.hotspotId.trim()) throw inputInvalid(`Caption ${index + 1} has no hotspot id.`, 'Captions hang on hotspots; an unnamed one cannot be found again.');
  if (!caption.disclosureId.trim()) {
    throw inputInvalid(`Caption "${caption.hotspotId}" is not bound to a disclosure record.`, 'The disclosure row is the evidence the dispute reads — the overlay is only a pointer to it.');
  }
  if (!caption.disclosureText.trim()) {
    throw inputInvalid(`Caption "${caption.hotspotId}" has no text.`, 'A model may not carry a condition claim that the text does not make.');
  }
  if (caption.position.some((axis) => !Number.isFinite(axis))) {
    throw inputInvalid(`Caption "${caption.hotspotId}" has a non-finite position.`, 'Positions are in unit space, from the metric alignment step.');
  }
  return {
    hotspotId: caption.hotspotId,
    position: caption.position,
    disclosureText: caption.disclosureText,
    severity: caption.severity,
    disclosureId: caption.disclosureId,
  };
}

function manifestChecksum(parts: { renditions: readonly Rendition[]; scope: ClaimScope; scale: number; captions: readonly ConditionCaption[] }): string {
  const canonical = [
    ...parts.renditions
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((r) => `${r.id}\u0000${r.bytes}\u0000${r.sha256}\u0000${r.bucketKey}`),
    parts.scope,
    parts.scale.toFixed(12),
    ...parts.captions.map((c) => `${c.hotspotId}\u0000${c.disclosureId}`),
  ].join('\u001f');
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

export function buildManifest(input: ManifestBuildInput): AssetManifest {
  if (!/^[A-Za-z0-9_-]+$/.test(input.assetId)) throw inputInvalid(`Asset id "${input.assetId}" is not usable in a bucket key.`, 'Use a bare id such as ast_017.');
  if (!Number.isInteger(input.version) || input.version < 1) throw inputInvalid(`Asset version ${input.version} is not a positive integer.`, 'Versions only move forward; a re-shoot opens the next one.');
  if (!Number.isFinite(input.metricScaleMetersPerUnit) || input.metricScaleMetersPerUnit <= 0) {
    throw inputInvalid(`metricScaleMetersPerUnit is ${input.metricScaleMetersPerUnit}.`, 'Run metric alignment first: an unscaled model silently implies a size.');
  }
  if (input.models.length === 0) throw inputInvalid('No model renditions were produced.', 'Nothing to publish — the static path (poster and turntable) still works without a capture.');

  const modelSet = new Set<LodTier>();
  for (const model of input.models) {
    if (model.lod === 'poster') throw inputInvalid(`${model.id} is a MODEL carrying the poster lod.`, 'Keep the poster out of the model chain; it is the static path, not a tier.');
    if (modelSet.has(model.lod)) {
      throw inputInvalid(
        `Two model renditions claim tier "${model.lod}".`,
        'A tier is a slot in the client ladder; two files in one slot means the client silently serves whichever it read last.',
      );
    }
    modelSet.add(model.lod);
  }
  if (input.poster.kind !== 'POSTER') {
    throw inputInvalid(
      `The poster slot holds ${input.poster.id}, which is a ${input.poster.kind}.`,
      'The poster is the no-WebGL path; a model in that slot would leave a buyer with nothing to look at.',
    );
  }

  const supported = input.qc.scopeSupported;
  // The starting point is the evidence, never the ask: with no recorded human decision the manifest
  // publishes exactly what the gates earned. A decision can narrow that; it cannot beat it.
  let claimScope: ClaimScope = supported;
  if (input.humanWiden) {
    if (!input.humanWiden.actor.trim() || !input.humanWiden.custodyRef.trim()) {
      throw inputInvalid(
        'A scope decision needs the officer who made it and the custody entry recording it.',
        'Decide the scope in the human QC step, where it is logged, not in the manifest.',
      );
    }
    // Asked for more than the gates earned is a refusal rather than a clamp, so the operator sees
    // that the claim was unavailable instead of watching it quietly disappear.
    if (scopeWidth(input.humanWiden.to) > scopeWidth(supported)) throw scopeExceedsEvidence(input.humanWiden.to, supported);
    claimScope = narrowerScope(supported, input.humanWiden.to);
  }

  const captions = input.captions.map(assertCaption);
  if (claimScope !== 'none' && captions.length === 0) {
    throw inputInvalid(
      `A model claiming "${claimScope}" must have at least one written disclosure behind it.`,
      'Record what the render shows as text — "no visible defects recorded at capture" is a valid entry, and it is the one a dispute can read.',
    );
  }

  const poster = toRendition(input.poster, input.assetId, input.version);
  const models = input.models
    .map((m) => toRendition(m, input.assetId, input.version))
    .sort((a, b) => LOD_ORDER.indexOf(a.lod) - LOD_ORDER.indexOf(b.lod));

  const renditions: Rendition[] = [...models];
  renditions.push(poster);
  if (input.sprite) {
    assertHonestRenditionSize(input.sprite);
    if (input.sprite.frames < 1) throw inputInvalid(`Turntable sprite declares ${input.sprite.frames} frames.`, 'The sprite is the static path; a frameless strip is not one.');
    renditions.push({
      id: input.sprite.id,
      kind: 'SPRITE',
      lod: 'poster',
      bytes: input.sprite.bytes,
      sha256: `sha256:${input.sprite.sha256}`,
      bucketKey: deriveRenditionKey({ assetId: input.assetId, version: input.version, lod: 'poster', mime: 'image/jpeg', suffix: 'sprite' }),
      mime: 'image/jpeg',
      widthPx: input.sprite.widthPx,
      heightPx: input.sprite.heightPx,
      frames: input.sprite.frames,
    });
  }

  // The poster and sprite live in dedicated fields as well, and every one of them is also listed
  // here: a client that walks `renditions` to size its fetch must not be able to miss a file.
  const spriteRendition = renditions.find((r) => r.kind === 'SPRITE');
  return {
    assetId: input.assetId,
    listingId: input.listingId,
    version: input.version,
    checksum: manifestChecksum({ renditions, scope: claimScope, scale: input.metricScaleMetersPerUnit, captions }),
    claimScope,
    metricScaleMetersPerUnit: input.metricScaleMetersPerUnit,
    renditions: Object.freeze(renditions),
    poster,
    ...(spriteRendition ? { sprite: spriteRendition } : {}),
    captions: Object.freeze(captions),
  };
}

/** Stable id for the turntable strip, shared with the CLI so a re-shoot reuses the naming. */
export function spriteRenditionId(assetId: string, version: number): string {
  return renditionId(assetId, version, 'poster').replace(/poster$/, 'sprite');
}
