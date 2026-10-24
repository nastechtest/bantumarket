import type { AttentionItem, AttentionKind } from './api/dashboard-transport.js';

/**
 * The action centre is ordered by what is blocking the seller's money, never by recency.
 *
 * A new question is a dopamine event and an unscheduled handover is a R4,200 obligation; sorting
 * by `createdAt` would put the question on top and cost the seller the sale. The comparator is
 * therefore lexicographic and total:
 *
 *   1. money bucket — work that releases held money beats work that creates money, which beats
 *      work that only improves the listing, which beats conversation;
 *   2. the amount blocked, largest first (within the bucket);
 *   3. the platform deadline, soonest first (items with no deadline last within their bucket);
 *   4. id, so the order is stable across reloads and test runs.
 *
 * `waiting on us` items are in the lowest buckets on purpose: they are not the seller's work and
 * must never displace it.
 */

/** 0 = money already held, 1 = money at risk, 2 = supply, 3 = conversation. */
const MONEY_BUCKET: Readonly<Record<AttentionKind, 0 | 1 | 2 | 3>> = {
  handover_unscheduled: 0,
  payout_failed: 0,
  bank_details_missing: 0,
  capture_rejected: 1,
  review_waiting_on_you: 1,
  draft_unfinished: 2,
  listing_in_review: 2,
  question_unanswered: 3,
};

export function moneyBucket(kind: AttentionKind): 0 | 1 | 2 | 3 {
  return MONEY_BUCKET[kind];
}

export function compareAttention(a: AttentionItem, b: AttentionItem): number {
  const bucket = moneyBucket(a.kind) - moneyBucket(b.kind);
  if (bucket !== 0) return bucket;

  const cents = b.blockingValue - a.blockingValue;
  if (cents !== 0) return cents;

  const aDue = a.dueAt === null ? Number.POSITIVE_INFINITY : Date.parse(a.dueAt);
  const bDue = b.dueAt === null ? Number.POSITIVE_INFINITY : Date.parse(b.dueAt);
  if (aDue !== bDue) return aDue - bDue;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Returns a new array; the transport's array is readonly input, never sorted in place. */
export function orderAttention(items: readonly AttentionItem[]): AttentionItem[] {
  return [...items].sort(compareAttention);
}

export interface AttentionSummary {
  readonly total: number;
  readonly needsYou: number;
  readonly waitingOnPlatform: number;
  readonly blockedValue: number;
}

export function summariseAttention(items: readonly AttentionItem[]): AttentionSummary {
  let needsYou = 0;
  let waitingOnPlatform = 0;
  let blockedValue = 0;
  for (const item of items) {
    if (item.kind === 'listing_in_review') waitingOnPlatform += 1;
    else needsYou += 1;
    blockedValue += item.blockingValue;
  }
  return { total: items.length, needsYou, waitingOnPlatform, blockedValue };
}

/**
 * Items the seller must personally act on. "No action needed from you" rows stay on the
 * dashboard as information but are not counted as work — a badge that includes them is a badge
 * the seller learns to ignore.
 */
export function actionableItems(items: readonly AttentionItem[]): AttentionItem[] {
  return orderAttention(items).filter((item) => item.kind !== 'listing_in_review');
}
