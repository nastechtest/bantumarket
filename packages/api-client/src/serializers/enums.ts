/**
 * Enum codecs: the wire vocabulary of the ledger ↔ the camelCase vocabulary of the UI, total by
 * construction.
 *
 * Every table below is typed `Readonly<Record<Union, string>>`, which is what makes "total" a
 * compiler fact rather than a review comment: add a state to `OrderStatus` or to `CaptureJobState`
 * and this file stops compiling until the mapping exists. That is the only way a vocabulary
 * correspondence stays true without somebody remembering to check.
 *
 * PROVENANCE of each wire set, because inventing one is how a client ships a state the ledger
 * refuses:
 *   - order status / event: `src/Orders/Order.php` (`AWAITING_PAYMENT` … `DISPUTE_RESOLVED_TO_SELLER`),
 *     re-declared as a CHECK in `db/migrations/001_money_path.sql`.
 *   - listing status: `catalogue.listings.status` CHECK — `ACTIVE, RESERVED, SOLD, WITHDRAWN`.
 *   - ledger entry type: `settlements.ledger_entries.entry_type` CHECK.
 *   - commission kind: `commissions.commission_entries.kind` CHECK — `FORWARD, REVERSAL`.
 *   - provider event type: `Payments/WebhookEvent.php` constants and the `provider_events.event_type`
 *     CHECK. These are dotted lower-case on the wire, which is why they need a codec like everything
 *     else rather than a `.toLowerCase()`.
 *
 * Three vocabularies are deliberately NOT re-declared here, because `packages/api-contracts` owns
 * them and shared-context.md forbids a second copy: the verification tier *labels*
 * (`TIER_LABELS`), the claim-scope *strings* (`CLAIM_SCOPE_DISCLOSURE`), and every budget number.
 * For those, the codec is the identity and the values come from the contract union itself.
 */

import type {
  CaptureJobState,
  ClaimScope,
  LodTier,
  RenditionKind,
  VerificationTier,
} from '@nastech/api-contracts';
import { contractViolation } from '../http/errors.js';
import type { OrderEvent, OrderStatus } from '../orders.js';

export type WireValue = string;

export interface EnumCodec<TDomain extends string, TWire extends string> {
  readonly name: string;
  /** Domain (camelCase, UI-facing) → wire (the ledger's spelling). */
  toWire(value: TDomain): TWire;
  /** Wire → domain. */
  toDomain(value: TWire): TDomain;
  decodeDomain(value: unknown, field: string): TDomain;
  decodeWire(value: unknown, field: string): TWire;
  readonly domainValues: readonly TDomain[];
  readonly wireValues: readonly TWire[];
}

/**
 * Build a codec from a total table. Throws at module load if two domain values share a wire value:
 * an ambiguous decode is a bug that must be impossible, not a fallback that picks the first match.
 */
export function buildCodec<TDomain extends string, TWire extends string>(
  name: string,
  forward: Readonly<Partial<Record<TDomain, TWire>>>,
): EnumCodec<TDomain, TWire> {
  const toWire = new Map<TDomain, TWire>();
  const toDomain = new Map<TWire, TDomain>();
  for (const [domain, wire] of Object.entries(forward) as [TDomain, TWire][]) {
    if (wire === undefined) {
      throw new TypeError(`Enum codec "${name}" has no wire value for "${domain}".`);
    }
    const collision = toDomain.get(wire);
    if (collision !== undefined) {
      throw new TypeError(`Enum codec "${name}" maps both "${collision}" and "${domain}" to "${wire}".`);
    }
    toWire.set(domain, wire);
    toDomain.set(wire, domain);
  }

  const domainValues = [...toWire.keys()];
  const wireValues = [...toDomain.keys()];

  return {
    name,
    toWire(value: TDomain): TWire {
      const wire = toWire.get(value);
      if (wire === undefined) {
        throw contractViolation('unknown_enum_value', `${name}.domain`, value, domainValues.join(' | '));
      }
      return wire;
    },
    toDomain(value: TWire): TDomain {
      const domain = toDomain.get(value);
      if (domain === undefined) {
        throw contractViolation('unknown_enum_value', `${name}.wire`, value, wireValues.join(' | '));
      }
      return domain;
    },
    decodeDomain(value: unknown, field: string): TDomain {
      if (typeof value !== 'string') {
        throw contractViolation('unknown_enum_value', field, value, domainValues.join(' | '));
      }
      // Already domain-shaped (a test fixture, a re-serialised cache entry) → accept as is.
      if ((domainValues as readonly string[]).includes(value)) return value as TDomain;
      const mapped = toDomain.get(value as TWire);
      if (mapped !== undefined) return mapped;
      throw contractViolation('unknown_enum_value', field, value, domainValues.join(' | '));
    },
    decodeWire(value: unknown, field: string): TWire {
      if (typeof value !== 'string') {
        throw contractViolation('unknown_enum_value', field, value, wireValues.join(' | '));
      }
      // The wire spelling is the contract; a domain spelling is converted rather than accepted, so a
      // caller never gets a camelCase value where a ledger string is typed.
      if ((wireValues as readonly string[]).includes(value)) return value as TWire;
      const wire = toWire.get(value as TDomain);
      if (wire !== undefined) return wire;
      throw contractViolation('unknown_enum_value', field, value, wireValues.join(' | '));
    },
    domainValues,
    wireValues,
  };
}

/** SCREAMING_SNAKE wire to camelCase domain, the general form of every table below. */
export function screamingToCamel(value: string): string {
  return value
    .toLowerCase()
    .replace(/_([a-z0-9])/g, (_m, char: string) => char.toUpperCase());
}

export function camelToScreaming(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toUpperCase();
}

/** Pairs a table from one union, guaranteeing the domain side is derived rather than retyped. */
function total<TDomain extends string, TWire extends string>(
  entries: ReadonlyArray<readonly [TDomain, TWire]>,
): Record<TDomain, TWire> {
  const out = {} as Record<TDomain, TWire>;
  for (const [domain, wire] of entries) out[domain] = wire;
  return out;
}

// ---------------------------------------------------------------------------
// Order vocabulary (src/Orders/Order.php)
// ---------------------------------------------------------------------------

/**
 * `OrderStatus` in camelCase. These strings are a UI/analytics *slug* — nothing in this client ever
 * sends one to the server, and `orders.ts`'s `OrderStatus` stays the only state name. Keeping the
 * slug table total is what stops a new ledger state from rendering as a blank chip.
 */
export const ORDER_STATUS_WIRE = total<OrderStatus, string>([
  ['AWAITING_PAYMENT', 'AWAITING_PAYMENT'],
  ['PAID', 'PAID'],
  ['HANDOVER_SCHEDULED', 'HANDOVER_SCHEDULED'],
  ['HANDOVER_CONFIRMED', 'HANDOVER_CONFIRMED'],
  ['COMPLETED', 'COMPLETED'],
  ['CANCELLED', 'CANCELLED'],
  ['REFUND_PENDING', 'REFUND_PENDING'],
  ['REFUNDED', 'REFUNDED'],
  ['IN_DISPUTE', 'IN_DISPUTE'],
]);

export const ORDER_EVENT_WIRE = total<OrderEvent, string>([
  ['PAYMENT_RECORDED', 'PAYMENT_RECORDED'],
  ['HANDOVER_SCHEDULED', 'HANDOVER_SCHEDULED'],
  ['HANDOVER_CONFIRMED', 'HANDOVER_CONFIRMED'],
  ['ORDER_COMPLETED', 'ORDER_COMPLETED'],
  ['CANCELLED', 'CANCELLED'],
  ['REFUND_INITIATED', 'REFUND_INITIATED'],
  ['REFUND_SETTLED', 'REFUND_SETTLED'],
  ['DISPUTE_OPENED', 'DISPUTE_OPENED'],
  ['DISPUTE_RESOLVED_TO_SELLER', 'DISPUTE_RESOLVED_TO_SELLER'],
]);

export const ORDER_STATUS_CODEC = buildCodec<OrderStatus, string>('orderStatus', ORDER_STATUS_WIRE);
export const ORDER_EVENT_CODEC = buildCodec<OrderEvent, string>('orderEvent', ORDER_EVENT_WIRE);

// ---------------------------------------------------------------------------
// Listing status (catalogue.listings.status CHECK, Listing.php constants)
// ---------------------------------------------------------------------------

export type ListingStatus = 'active' | 'reserved' | 'sold' | 'withdrawn';

export const LISTING_STATUS_CODEC = buildCodec<ListingStatus, string>('listingStatus',
  total<ListingStatus, string>([
    ['active', 'ACTIVE'],
    ['reserved', 'RESERVED'],
    ['sold', 'SOLD'],
    ['withdrawn', 'WITHDRAWN'],
  ]),
);

// ---------------------------------------------------------------------------
// Ledger + commission vocabulary (settlements / commissions CHECKs)
// ---------------------------------------------------------------------------

export type LedgerEntryType =
  | 'sellerEarnings'
  | 'commission'
  | 'commissionReversal'
  | 'refund'
  | 'payout'
  | 'chargeback'
  | 'hold'
  | 'holdRelease';

export const LEDGER_ENTRY_TYPE_CODEC = buildCodec<LedgerEntryType, string>('ledgerEntryType',
  total<LedgerEntryType, string>([
    ['sellerEarnings', 'SELLER_EARNINGS'],
    ['commission', 'COMMISSION'],
    ['commissionReversal', 'COMMISSION_REVERSAL'],
    ['refund', 'REFUND'],
    ['payout', 'PAYOUT'],
    ['chargeback', 'CHARGEBACK'],
    ['hold', 'HOLD'],
    ['holdRelease', 'HOLD_RELEASE'],
  ]),
);

export type CommissionKind = 'forward' | 'reversal';

export const COMMISSION_KIND_CODEC = buildCodec<CommissionKind, string>('commissionKind',
  total<CommissionKind, string>([
    ['forward', 'FORWARD'],
    ['reversal', 'REVERSAL'],
  ]),
);

// ---------------------------------------------------------------------------
// Payments (Payments/WebhookEvent.php, provider_events.event_type CHECK)
// ---------------------------------------------------------------------------

export type ProviderEventType = 'paymentCaptured' | 'refundSettled' | 'chargebackOpened';

export const PROVIDER_EVENT_TYPE_CODEC = buildCodec<ProviderEventType, string>('providerEventType',
  total<ProviderEventType, string>([
    ['paymentCaptured', 'payment.captured'],
    ['refundSettled', 'refund.settled'],
    ['chargebackOpened', 'chargeback.opened'],
  ]),
);

/** `PaymentRecordingResult` — three honest outcomes, none of them an HTTP error. */
export type PaymentRecordingOutcome = 'accepted' | 'duplicate' | 'discrepancy';

export const PAYMENT_RECORDING_CODEC = buildCodec<PaymentRecordingOutcome, string>('paymentRecordingOutcome',
  total<PaymentRecordingOutcome, string>([
    ['accepted', 'accepted'],
    ['duplicate', 'duplicate'],
    ['discrepancy', 'discrepancy'],
  ]),
);

// ---------------------------------------------------------------------------
// api-contracts vocabularies
// ---------------------------------------------------------------------------

/** Identity tables: the contract union *is* the wire spelling. Totality is still checked. */
export const VERIFICATION_TIER_CODEC = buildCodec<VerificationTier, VerificationTier>('verificationTier',
  total<VerificationTier, VerificationTier>([
    ['T1', 'T1'],
    ['T2', 'T2'],
    ['T3', 'T3'],
    ['T4', 'T4'],
    ['T5', 'T5'],
  ]),
);

export const RENDITION_KIND_CODEC = buildCodec<RenditionKind, RenditionKind>('renditionKind',
  total<RenditionKind, RenditionKind>([
    ['MODEL', 'MODEL'],
    ['SPRITE', 'SPRITE'],
    ['POSTER', 'POSTER'],
    ['MACRO', 'MACRO'],
    ['THUMBNAIL', 'THUMBNAIL'],
  ]),
);

/** `LodTier` is lower-case in the contract (`lod0`) and SCREAMING in a storage row. */
export const LOD_TIER_CODEC = buildCodec<LodTier, string>('lodTier',
  total<LodTier, string>([
    ['lod0', 'LOD0'],
    ['lod1', 'LOD1'],
    ['lod2', 'LOD2'],
    ['poster', 'POSTER'],
  ]),
);

/**
 * Claim scope is identity by rule: `CLAIM_SCOPE_DISCLOSURE` in api-contracts is the authority for
 * these strings and shared-context.md forbids a second copy, so no camelCase alias is minted here.
 */
export const CLAIM_SCOPE_CODEC = buildCodec<ClaimScope, ClaimScope>('claimScope',
  total<ClaimScope, ClaimScope>([
    ['geometry_and_external_condition', 'geometry_and_external_condition'],
    ['condition_only', 'condition_only'],
    ['none', 'none'],
  ]),
);

/** Capture-job states: lower snake in the contract, SCREAMING in a queue row. */
export const CAPTURE_JOB_STATE_CODEC = buildCodec<CaptureJobState, string>('captureJobState',
  total<CaptureJobState, string>([
    ['intake', 'INTAKE'],
    ['captured', 'CAPTURED'],
    ['processed', 'PROCESSED'],
    ['qc_auto', 'QC_AUTO'],
    ['qc_human', 'QC_HUMAN'],
    ['published', 'PUBLISHED'],
    ['failed', 'FAILED'],
    ['reshot', 'RESHOT'],
  ]),
);

/**
 * Every codec in one list, so a test can walk the whole vocabulary surface without importing each
 * codec by name. Typed down to the parts that are codec-agnostic.
 */
export interface CodecSurface {
  readonly name: string;
  readonly domainValues: readonly string[];
  readonly wireValues: readonly string[];
}

export const ALL_CODECS: readonly CodecSurface[] = [
  ORDER_STATUS_CODEC,
  ORDER_EVENT_CODEC,
  LISTING_STATUS_CODEC,
  LEDGER_ENTRY_TYPE_CODEC,
  COMMISSION_KIND_CODEC,
  PROVIDER_EVENT_TYPE_CODEC,
  PAYMENT_RECORDING_CODEC,
  VERIFICATION_TIER_CODEC,
  RENDITION_KIND_CODEC,
  LOD_TIER_CODEC,
  CLAIM_SCOPE_CODEC,
  CAPTURE_JOB_STATE_CODEC,
];

/**
 * A status name that has no outgoing edge is a fact the UI must render differently
 * (`Order::isTerminal`). This reads the wire spelling, so a caller that only has a string from a
 * payload can still ask the question without importing the state machine.
 */
export function isTerminalOrderStatusWire(status: unknown): boolean {
  if (typeof status !== 'string') return false;
  return status === 'COMPLETED' || status === 'CANCELLED' || status === 'REFUNDED';
}
