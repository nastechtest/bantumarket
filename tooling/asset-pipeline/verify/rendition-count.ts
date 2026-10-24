/**
 * Rendition set completeness.
 *
 * A manifest is a promise that a client can fetch one model per tier and a poster. If the promise
 * is short a tier, the buyer's device picks the missing one and gets a 404 it cannot tell apart from
 * an outage. If it is long — two files claiming `lod1` — the client serves whichever it read last,
 * which may be the tier that failed QC. Both are checked here, before release, against the set the
 * pipeline is supposed to produce.
 */

import type { LodTier, RenditionKind } from '@nastech/api-contracts';
import { inputInvalid, renditionSetIncomplete } from '../errors.js';
import { SHA256_HEX } from './sha256.js';

export interface ExpectedRendition {
  readonly lod: LodTier;
  readonly kind: RenditionKind;
  readonly required: boolean;
}

export interface DeliveredRendition {
  readonly id: string;
  readonly lod: LodTier;
  readonly kind: RenditionKind;
  readonly bytes: number;
  readonly sha256: string;
}

export interface RenditionSetReport {
  readonly ok: boolean;
  readonly expected: readonly ExpectedRendition[];
  readonly missing: readonly string[];
  readonly duplicates: readonly string[];
  readonly unexpected: readonly string[];
  readonly unsized: readonly string[];
  readonly count: number;
}

/** The chain every publishable asset owes a client: three models and the static poster. */
export const REQUIRED_RENDITIONS: readonly ExpectedRendition[] = [
  { lod: 'lod0', kind: 'MODEL', required: true },
  { lod: 'lod1', kind: 'MODEL', required: true },
  { lod: 'lod2', kind: 'MODEL', required: true },
  { lod: 'poster', kind: 'POSTER', required: true },
];

export const OPTIONAL_RENDITIONS: readonly ExpectedRendition[] = [
  { lod: 'poster', kind: 'SPRITE', required: false },
];

export function expectedRenditionSet(includeSprite: boolean): readonly ExpectedRendition[] {
  return includeSprite ? [...REQUIRED_RENDITIONS, ...OPTIONAL_RENDITIONS] : REQUIRED_RENDITIONS;
}

export function checkRenditionSet(
  delivered: readonly DeliveredRendition[],
  expected: readonly ExpectedRendition[] = REQUIRED_RENDITIONS,
): RenditionSetReport {
  const missing: string[] = [];
  const duplicates: string[] = [];
  const unexpected: string[] = [];
  const unsized: string[] = [];

  for (const want of expected) {
    const matches = delivered.filter((item) => item.lod === want.lod && item.kind === want.kind);
    if (matches.length === 0) {
      if (want.required) missing.push(`${want.lod}:${want.kind}`);
    } else if (matches.length > 1) {
      duplicates.push(`${want.lod}:${want.kind}`);
    }
  }
  for (const item of delivered) {
    const known = expected.some((want) => want.lod === item.lod && want.kind === item.kind);
    if (!known) unexpected.push(`${item.lod}:${item.kind}`);
    if (!Number.isInteger(item.bytes) || item.bytes <= 0 || !SHA256_HEX.test(item.sha256)) {
      unsized.push(item.id);
    }
  }
  const ids = delivered.map((item) => item.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  for (const id of new Set(duplicateIds)) duplicates.push(`id:${id}`);

  return {
    ok: missing.length === 0 && duplicates.length === 0 && unsized.length === 0,
    expected: Object.freeze([...expected]),
    missing: Object.freeze(missing),
    duplicates: Object.freeze([...new Set(duplicates)]),
    unexpected: Object.freeze(unexpected),
    unsized: Object.freeze(unsized),
    count: delivered.length,
  };
}

export function assertRenditionSet(report: RenditionSetReport, assetId: string): void {
  if (!report.ok) throw renditionSetIncomplete(assetId, report.missing, report.duplicates);
  if (report.unsized.length > 0) {
    throw inputInvalid(
      `Rendition(s) ${report.unsized.join(', ')} have no honest size or digest.`,
      'Hash the produced file; a manifestation cannot gate a fetch on a size nobody measured.',
    );
  }
}
