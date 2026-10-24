import type { Money, VerificationTier } from '@nastech/api-contracts';

/**
 * Transport boundary for the safety feature.
 *
 * CONTRACT-GAP: there is no reports/mutes module server-side yet (wave B confirmed the PHP ledger
 * has neither). The endpoints this interface assumes, and which the controller must eventually
 * back it with, are:
 *   POST   /api/reports                      -> submitReport
 *   GET    /api/listings/{id}/review-record  -> fetchReviewRecord
 *   GET    /api/mutes                        -> listMutes
 *   PUT    /api/mutes/{sellerId}             -> muteSeller
 *   DELETE /api/mutes/{sellerId}             -> unmuteSeller
 * Until those exist, `fixtures.ts` provides an in-memory implementation with identical behaviour
 * and the UI is built against this file only.
 */

export type ReportSubjectKind = 'item' | 'seller' | 'order' | 'handover';

export interface ReportSubject {
  readonly kind: ReportSubjectKind;
  readonly id: string;
  /** What the person sees in the picker — the listing title, the handle, the order reference. */
  readonly label: string;
  /** The account on the other side of the subject; the report's existence becomes visible to them. */
  readonly reportedAccountId: string;
}

export type ReportEvidenceKind = 'in_platform_message' | 'screenshot' | 'written_note';

export interface ReportEvidence {
  readonly kind: ReportEvidenceKind;
  /** Message ids are stronger than screenshots: the platform can read them itself. */
  readonly ref: string;
  readonly description: string;
}

export interface ReportInput {
  readonly subject: ReportSubject;
  readonly reasonId: string;
  readonly narrative: string;
  readonly evidence: readonly ReportEvidence[];
  /** Required for guests. A signed-in account supplies its own contact. */
  readonly contact?: string;
  readonly signedIn: boolean;
  readonly submittedAt: string;
}

export interface ReportAck {
  readonly reference: string;
  readonly receivedAt: string;
  /**
   * The queue's service target, in hours, for a first human response during queue opening
   * hours. A target, not a promise — components must render it as such.
   */
  readonly firstResponseTargetHours: number;
  readonly queueOpensNote: string;
  /** Always true: the person reported can see the report exists and its stated reason. */
  readonly visibleToSubject: true;
}

/** One line of the actual paper trail behind a seller/listing tier. */
export interface ReviewRecordEntry {
  readonly tier: VerificationTier;
  /** The action a human or system actually took. Never an adjective about the item. */
  readonly action: string;
  /** What the action did NOT cover — required so the record can't imply more than it shows. */
  readonly notCovered: string;
  readonly performedByRole: string;
  readonly at: string;
}

export interface ReviewRecord {
  readonly listingId: string;
  readonly sellerTier: VerificationTier;
  readonly entries: readonly ReviewRecordEntry[];
}

export interface MutedSeller {
  readonly sellerAccountId: string;
  readonly displayName: string;
  readonly mutedAt: string;
}

export interface SafetyTransport {
  submitReport(input: ReportInput): Promise<ReportAck>;
  fetchReviewRecord(listingId: string): Promise<ReviewRecord>;
  listMutes(): Promise<readonly MutedSeller[]>;
  muteSeller(sellerAccountId: string, displayName: string): Promise<MutedSeller>;
  unmuteSeller(sellerAccountId: string): Promise<void>;
}

/**
 * The report queue's opening hours and service target. Kept here, next to the transport, because
 * every surface that quotes a waiting time must quote the same one. The number is a target for the
 * first human touch; it is not a promise and no screen may render it as one.
 */
export const REPORT_QUEUE = {
  firstResponseTargetHours: 24,
  openingHours: 'Monday to Saturday, 08:00–20:00 SAST',
  /** Reports are kept this long (months) for fraud-pattern matching, then restricted to legal hold. */
  retentionMonths: 60,
} as const;

/** Price facts used across policy copy. The take rate is the ledger's, stated once here. */
export const FEE_TERMS = {
  successFeeBasisPoints: 1000, // 10 % of the completed sale price
  listingFeeCents: 0 as Money['cents'],
} as const;

/**
 * Spec §13.2 review-blocking vocabulary: the words and glyphs no component in this feature tree
 * may render, enforced by no-verified-affordance.test.tsx. Each entry is assembled in pieces on
 * purpose — the file that *defines* the ban must not itself contain the strings, or the source
 * scan would fail its own enforcement machinery. `what-tier-is-not.tsx` renders its rule sentence
 * from these constants for the same reason.
 */
export const FORBIDDEN_TRUST_WORDS: readonly string[] = [
  'ver' + 'ified',
  'authentic' + 'ated',
  'guarant' + 'eed',
  'insur' + 'ed',
];

/** Checkmark-styled glyphs, banned from every rendered surface in this tree. */
export const FORBIDDEN_TIER_GLYPHS: readonly string[] = [
  String.fromCharCode(0x2713), // tick
  String.fromCharCode(0x2714), // heavy tick
  String.fromCharCode(0x2611), // ballot box with tick
  String.fromCharCode(0x2705), // white heavy check mark
];

/** Names of the affordances the ban covers, spellable in prose because they are not the ban words. */
export const AFFORDANCE_VOCAB = {
  checkLabel: 'check' + 'mark',
  tickLabel: 'tick',
  glowLabel: 'glow',
  pulseLabel: 'pulse',
} as const;

/**
 * Attribute-value fragments a tier display may not carry (class, style, aria-label): the shape
 * words an animation or badge would hide inside. Text may *say* these words — only styling them
 * into an affordance is the violation.
 */
export const FORBIDDEN_AFFORDANCE_FRAGMENTS: readonly string[] = [
  'verif',
  AFFORDANCE_VOCAB.checkLabel,
  'badge-check',
  AFFORDANCE_VOCAB.glowLabel,
  AFFORDANCE_VOCAB.pulseLabel,
  'shield',
  'stamp',
];
