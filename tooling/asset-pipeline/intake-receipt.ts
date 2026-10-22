/**
 * Intake receipt and the economic gate in front of it.
 *
 * The receipt is the paper half of chain of custody. The custody log proves what the studio did;
 * the receipt is what the *seller* can hold up later to ask "is the watch in your studio the watch
 * I handed you" — so it has to carry the item, the person who took it, the instant custody started,
 * and the digest of the custody row that recorded it. A code that is not derivable from those
 * fields is decoration.
 *
 * The viability check lives here because it is the thing that makes the receipt legal to print: at
 * roughly R270 of capture cost against a 10 % commission, an item must clear about R2,700 before
 * spending the capture budget returns anything. Below that line the right answer is the static path
 * (poster, turntable, written condition), which is sufficient rather than diminished — so refusing
 * here is not a downgrade of the seller's listing, it is not burning a scarce studio slot.
 */

import { createHash } from 'node:crypto';
import type { Money } from '@nastech/api-contracts';
import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import { captureNotViable, formatRand, inputInvalid } from './errors.js';
import type { CustodyLog } from './custody.js';

/**
 * Studio cost per captured item and the platform take rate. `budgets` in api-contracts governs
 * bytes, not money, so the economics are declared once here — and derived, never typed twice:
 * the break-even line is a computation over these two, not a third constant someone can forget to
 * update when the take rate changes.
 */
export const CAPTURE_COST_CENTS = 27_000;
export const TAKE_RATE = 0.1;
export const BREAK_EVEN_CENTS = Math.round(CAPTURE_COST_CENTS / TAKE_RATE);

export interface CaptureViability {
  readonly viable: boolean;
  readonly priceCents: number;
  readonly captureCostCents: number;
  readonly takeRate: number;
  readonly breakEvenCents: number;
  /** Negative means the capture is already a loss at this price. */
  readonly headroomCents: number;
  readonly commissionCents: number;
  readonly reason: string;
}

const rand = formatRand;

export function assessCaptureViability(price: Money): CaptureViability {
  if (!Number.isInteger(price.cents)) throw inputInvalid(`Price must be whole cents, got ${price.cents}.`, 'Money arrives from the ledger in cents.');
  if (price.currency !== 'ZAR') throw inputInvalid(`Capture economics are ZAR-only for the pilot, got ${price.currency}.`, 'South Africa only, one city, one currency.');
  const commissionCents = Math.floor(price.cents * TAKE_RATE);
  const headroomCents = commissionCents - CAPTURE_COST_CENTS;
  const viable = price.cents >= BREAK_EVEN_CENTS;
  return {
    viable,
    priceCents: price.cents,
    captureCostCents: CAPTURE_COST_CENTS,
    takeRate: TAKE_RATE,
    breakEvenCents: BREAK_EVEN_CENTS,
    headroomCents,
    commissionCents,
    reason: viable
      ? `Commission on ${rand(price.cents)} is ${rand(commissionCents)} against ${rand(CAPTURE_COST_CENTS)} of capture cost — ${rand(headroomCents)} of headroom.`
      : `${rand(price.cents)} returns ${rand(commissionCents)} of commission, which does not recover the ${rand(CAPTURE_COST_CENTS)} capture cost. List it on the static path instead.`,
  };
}

export function requireCaptureViability(price: Money): CaptureViability {
  const verdict = assessCaptureViability(price);
  if (!verdict.viable) {
    throw captureNotViable(verdict.priceCents, verdict.breakEvenCents, CAPTURE_COST_CENTS, TAKE_RATE);
  }
  return verdict;
}

export interface IntakeReceipt {
  readonly code: string;
  readonly jobId: string;
  readonly itemId: string;
  readonly listingId: string | null;
  readonly title: string;
  readonly priceCents: number;
  readonly currency: 'ZAR';
  readonly takenBy: string;
  readonly studio: string;
  readonly at: string;
  /** Digest of the custody row that opened this job — what makes the paper and the log the same event. */
  readonly custodyStartHash: string;
  readonly conditionNotes: readonly string[];
  readonly viability: CaptureViability;
  readonly scopeDisclosure: string;
}

export interface ReceiptInput {
  readonly jobId: string;
  readonly itemId: string;
  readonly listingId: string | null;
  readonly title: string;
  readonly price: Money;
  readonly takenBy: string;
  readonly studio: string;
  readonly at: string;
  readonly custodyStartHash: string;
  readonly conditionNotes?: readonly string[];
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function receiptFingerprint(input: Omit<IntakeReceipt, 'code'>): string {
  const canonical = [
    input.jobId,
    input.itemId,
    input.listingId ?? '',
    input.priceCents,
    input.takenBy,
    input.at,
    input.custodyStartHash,
  ].join('\u001f');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function base32From(hex: string, length: number): string {
  let out = '';
  for (let i = 0; i + 1 < hex.length && out.length < length; i += 2) {
    out += CODE_ALPHABET[Number.parseInt(hex.slice(i, i + 2), 16) % CODE_ALPHABET.length];
  }
  return out;
}

/** The check digits catch a mistyped code at the desk instead of at the dispute stage. */
function checkDigits(hex: string): string {
  const sum = [...hex].reduce((acc, c) => acc + Number.parseInt(c, 16), 0);
  return String(97 - (sum % 97)).padStart(2, '0');
}

export function issueReceipt(input: ReceiptInput): IntakeReceipt {
  const viability = requireCaptureViability(input.price);
  for (const [field, value] of [
    ['job id', input.jobId],
    ['item id', input.itemId],
    ['title', input.title],
    ['the person taking the item', input.takenBy],
    ['the studio location', input.studio],
  ] as const) {
    if (!value.trim()) throw inputInvalid(`The receipt needs ${field}.`, 'A receipt that cannot identify the item or the taker is not custody evidence.');
  }
  if (!/^[0-9a-f]{64}$/.test(input.custodyStartHash)) {
    throw inputInvalid('The receipt needs the digest of the custody row that opened this job.', 'Run intake so custody starts before the receipt prints — never the other way round.');
  }

  const core: Omit<IntakeReceipt, 'code'> = {
    jobId: input.jobId.trim(),
    itemId: input.itemId.trim(),
    listingId: input.listingId,
    title: input.title.trim(),
    priceCents: input.price.cents,
    currency: input.price.currency,
    takenBy: input.takenBy.trim(),
    studio: input.studio.trim(),
    at: input.at,
    custodyStartHash: input.custodyStartHash,
    conditionNotes: Object.freeze([...(input.conditionNotes ?? [])]),
    viability,
    // The seller reads what the eventual 3D display will and will not promise. Imported from the
    // contract so the receipt and the buyer-facing disclosure cannot drift into two vocabularies.
    scopeDisclosure: CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition,
  };
  const hex = receiptFingerprint(core);
  return { code: `NAS-${base32From(hex, 8)}-${checkDigits(hex)}`, ...core };
}

export function receiptCodeIsWellFormed(code: string): boolean {
  return /^NAS-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}-\d{2}$/.test(code);
}

/** Recompute the code from the record: a reprinted or forged receipt fails here, not in a dispute. */
export function verifyReceiptCode(receipt: IntakeReceipt): { ok: boolean; expected: string } {
  // Destructuring rather than re-listing the fields is the invariant: if a field is added to the
  // receipt it enters the fingerprint on both sides at once, instead of silently making every
  // printed receipt verify as forged.
  const { code: _printed, ...core } = receipt;
  const hex = receiptFingerprint(core);
  const expected = `NAS-${base32From(hex, 8)}-${checkDigits(hex)}`;
  return { ok: expected === receipt.code, expected };
}

export type CustodyMatch =
  | { ok: true; jobId: string; startedAt: string; actor: string }
  | { ok: false; reason: string };

/**
 * The check the seller's question actually needs: does the studio hold a job for this item, opened
 * by this person, at the instant printed on the paper, and is that row still the row the chain says
 * it was?
 */
export function matchReceiptToCustody(receipt: IntakeReceipt, log: CustodyLog): CustodyMatch {
  const rows = log.records(receipt.jobId);
  if (rows.length === 0) return { ok: false, reason: `No custody history exists for job ${receipt.jobId}.` };
  const genesis = rows[0]!;
  if (genesis.to !== 'intake') return { ok: false, reason: `Job ${receipt.jobId} was not opened by an intake entry.` };
  if (genesis.hash !== receipt.custodyStartHash) {
    return { ok: false, reason: 'The custody row behind this receipt no longer matches its printed digest.' };
  }
  if (genesis.actor !== receipt.takenBy) return { ok: false, reason: `Custody names "${genesis.actor}"; the receipt names "${receipt.takenBy}".` };
  if (genesis.at !== receipt.at) return { ok: false, reason: `Custody started at ${genesis.at}; the receipt says ${receipt.at}.` };
  const chain = log.verify();
  if (!chain.ok) return { ok: false, reason: `The custody chain is broken at entry ${chain.sequence} (${chain.reason}); treat this item as unverified custody.` };
  return { ok: true, jobId: receipt.jobId, startedAt: genesis.at, actor: genesis.actor };
}

/**
 * Fixed-width text block for the studio's receipt printer. The seller keeps the item id and the
 * code; the code alone is enough for staff to re-find the job, which is the point of printing it.
 */
export function renderReceiptText(receipt: IntakeReceipt): string {
  const rule = '='.repeat(58);
  const thin = '-'.repeat(58);
  const localTime = `${receipt.at} (Africa/Johannesburg)`;
  const notes = receipt.conditionNotes.length > 0
    ? receipt.conditionNotes.map((n) => `  - ${n}`).join('\n')
    : '  - none recorded at drop-off';
  return [
    rule,
    'NASTECH MARKET — CAPTURE INTAKE RECEIPT',
    rule,
    `RECEIPT CODE   ${receipt.code}`,
    `JOB            ${receipt.jobId}`,
    `ITEM ID        ${receipt.itemId}`,
    `LISTING        ${receipt.listingId ?? 'not yet linked'}`,
    `ITEM           ${receipt.title}`,
    `DECLARED PRICE ${rand(receipt.priceCents)} ${receipt.currency}`,
    thin,
    `TAKEN IN BY    ${receipt.takenBy}`,
    `STUDIO         ${receipt.studio}`,
    `CUSTODY START  ${localTime}`,
    `CUSTODY ROW    ${receipt.custodyStartHash.slice(0, 16)}…`,
    thin,
    'CONDITION NOTED AT DROP-OFF',
    notes,
    thin,
    'IF A 3D VIEW IS MADE FROM THIS ITEM, IT SHOWS:',
    `  ${receipt.scopeDisclosure}`,
    thin,
    'Keep this receipt. It is how you check that the item we photographed',
    'is the item you handed over. Query anything here with the code above.',
    rule,
  ].join('\n');
}

export function renderReceiptJson(receipt: IntakeReceipt): string {
  return JSON.stringify(
    {
      receiptCode: receipt.code,
      jobId: receipt.jobId,
      itemId: receipt.itemId,
      listingId: receipt.listingId,
      title: receipt.title,
      priceCents: receipt.priceCents,
      currency: receipt.currency,
      takenBy: receipt.takenBy,
      studio: receipt.studio,
      custodyStart: receipt.at,
      custodyStartHash: receipt.custodyStartHash,
      conditionNotes: receipt.conditionNotes,
      captureEconomics: {
        captureCostCents: CAPTURE_COST_CENTS,
        takeRate: TAKE_RATE,
        breakEvenCents: receipt.viability.breakEvenCents,
        commissionCents: receipt.viability.commissionCents,
        headroomCents: receipt.viability.headroomCents,
      },
      scopeDisclosure: receipt.scopeDisclosure,
    },
    null,
    2,
  );
}
