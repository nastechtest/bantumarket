/**
 * The item page's data boundary.
 *
 * // CONTRACT-GAP: @nastech/api-contracts has `ListingSummary` (a search card) and `AssetManifest`
 * // (a capture artefact) but no listing-detail DTO — the static item page needs photographs,
 * // written condition records and seller response data without depending on any of that, and it
 * // must keep working when the manifest endpoint is slow, missing, or describing a listing that
 * // was never captured. `ItemDetail` below is that shape, assembled only from contract primitives
 * // (Money, VerificationTier, ClaimScope, and the severity vocabulary lifted off
 * // ConditionCaption so a fourth severity cannot appear here before it appears in the contract).
 * // When contracts gains a detail DTO, this file moves there and only the imports change.
 *
 * The page never imports a transport implementation directly; `use-item` takes one as a parameter,
 * so the fixture path and the (future) HTTP path are interchangeable at the composition root.
 */

import type { ClaimScope, ConditionCaption, Money, VerificationTier } from '@nastech/api-contracts';
import type { HttpMethod, Transport } from '@nastech/api-client';
import { execute, isApiError } from '@nastech/api-client';

/** Derived from the contract, never re-declared: the severity set is exactly ConditionCaption's. */
export type ConditionSeverity = ConditionCaption['severity'];

export const CONDITION_SEVERITIES: readonly ConditionSeverity[] = ['cosmetic', 'functional', 'unknown'];

export function isConditionSeverity(value: unknown): value is ConditionSeverity {
  return (CONDITION_SEVERITIES as readonly string[]).includes(value as string);
}

/** One photograph the buyer can actually see — no signed-URL secret handling in props: the
 * fixture resolves URLs eagerly; the remote transport resolves them before returning the DTO. */
export interface StillImage {
  readonly id: string;
  readonly url: string;
  readonly alt: string;
  readonly widthPx?: number;
  readonly heightPx?: number;
}

/**
 * The 12-frame turntable. Exactly one sanctioned count: the strip exists because the capture
 * programme produces twelve frames, and the fence test for that number lives in the media module.
 * `null` turntable on an ItemDetail means "never captured" — the page then shows photographs and
 * the written record, which is sufficient, not diminished.
 */
export const TURNTABLE_FRAME_COUNT = 12 as const;

export type TurntableFrames =
  | { readonly kind: 'strip'; readonly stripUrl: string; readonly frames: number }
  | { readonly kind: 'sequence'; readonly urls: readonly string[] };

export interface SellerInfo {
  readonly displayName: string;
  readonly tier: VerificationTier;
  /** ISO-8601 date the account was opened; rendered as a year. */
  readonly memberSince: string;
  readonly city: string;
  /** null when the seller has no measured history — the UI says so plainly instead of guessing. */
  readonly typicalResponseHours: number | null;
}

export interface ConditionRecord {
  readonly disclosureId: string;
  /** What the dispute process reads. The photograph points at this; this does not point back. */
  readonly text: string;
  readonly severity: ConditionSeverity;
  /** Human location words — "bezel at 2 o'clock" — because hotspot positions mean nothing in text. */
  readonly location: string;
  /** Hotspot id on the 3D page, when the listing has a manifest. Optional by contract-gap design. */
  readonly hotspotId?: string;
}

export interface ItemDetail {
  readonly listingId: string;
  readonly title: string;
  readonly description: string;
  readonly price: Money;
  readonly categorySlug: string;
  readonly seller: SellerInfo;
  readonly poster: StillImage;
  /** Additional photographs after the poster; an empty array is legal (poster-only listing). */
  readonly stills: readonly StillImage[];
  readonly turntable: TurntableFrames | null;
  readonly has3d: boolean;
  readonly claimScope: ClaimScope;
  readonly conditionRecords: readonly ConditionRecord[];
  readonly listedAt: string;
  readonly inStock: boolean;
}

export type ItemFailureKind = 'not_found' | 'network' | 'server' | 'validation';

/** Typed failure, not a thrown string: `use-item` maps the kind to `item-error.tsx` copy. */
export class ItemRequestError extends Error {
  readonly kind: ItemFailureKind;
  constructor(kind: ItemFailureKind) {
    // Static message per kind: this client never echoes URLs or inputs into errors (the signed-URL
    // discipline of @nastech/api-client, kept here for consistency).
    super(`item request failed: ${kind}`);
    this.name = 'ItemRequestError';
    this.kind = kind;
  }
}

export type QuestionOutcome = { readonly kind: 'queued' } | { readonly kind: 'rejected'; readonly reason: string };
export type ReportOutcome = { readonly kind: 'received' } | { readonly kind: 'rejected'; readonly reason: string };

export interface ItemTransport {
  getDetail(listingId: string): Promise<ItemDetail>;
  /**
   * // CONTRACT-GAP: no HTTP layer exists yet (ADR 0002), so question and report endpoints are
   * // assumed here: POST /v1/listings/:id/questions and POST /v1/listings/:id/reports.
   */
  askQuestion(listingId: string, question: string): Promise<QuestionOutcome>;
  reportListing(listingId: string, reason: ReportReason): Promise<ReportOutcome>;
}

export const REPORT_REASONS = [
  { value: 'misleading_condition', label: 'The condition described is not what this is' },
  { value: 'not_mine', label: 'This item does not belong to the seller' },
  { value: 'prohibited', label: 'Prohibited or dangerous item' },
  { value: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

export function isReportReason(value: unknown): value is ReportReason {
  return REPORT_REASONS.some((r) => r.value === value);
}

/**
 * Remote transport against the assumed endpoints, built on the completed @nastech/api-client
 * `Transport` so timeout/cancellation/error classification stay in one place. The PHP backend has
 * no HTTP layer yet; nothing exercises this path until the controller wires it, and the fixture
 * transport is the pilot default.
 */
export function createRemoteItemTransport(transport: Transport): ItemTransport {
  async function run<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    try {
      return await execute<T>(transport, { method, path, ...(body !== undefined ? { body } : {}) });
    } catch (error) {
      throw toItemRequestError(error);
    }
  }
  return {
    getDetail(listingId) {
      return run<ItemDetail>('GET', `/v1/listings/${encodeURIComponent(listingId)}/detail`);
    },
    askQuestion(listingId, question) {
      return run<QuestionOutcome>('POST', `/v1/listings/${encodeURIComponent(listingId)}/questions`, { question });
    },
    reportListing(listingId, reason) {
      return run<ReportOutcome>('POST', `/v1/listings/${encodeURIComponent(listingId)}/reports`, { reason });
    },
  };
}

/**
 * The api-client taxonomy is the authority; this only re-names it into the page's three failure
 * states. An unknown throw is a bug, not a network event, and surfaces as `server` rather than
 * pretending to be classified.
 */
export function toItemRequestError(error: unknown): ItemRequestError {
  if (isApiError(error)) {
    switch (error.kind) {
      case 'notFound':
        return new ItemRequestError('not_found');
      case 'validation':
        return new ItemRequestError('validation');
      case 'network':
      case 'timeout':
        return new ItemRequestError('network');
      default:
        return new ItemRequestError('server');
    }
  }
  return new ItemRequestError('server');
}
