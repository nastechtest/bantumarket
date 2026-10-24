import { formatCents } from '@nastech/design-system';
import type { DashboardSnapshot } from './api/dashboard-transport.js';

/**
 * Exactly one imperative for today. The screen may show ten things, but the first block says one
 * thing; a seller who has to read three paragraphs to learn they must attend a handover has been
 * failed by the screen.
 */
export interface NextStep {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly cta: string;
  readonly href: string;
  readonly learnMore: string | null;
}

export function nextStepFor(snapshot: DashboardSnapshot): NextStep | null {
  const handover = snapshot.attention.find((a) => a.kind === 'handover_unscheduled');
  if (snapshot.payout.status === 'failed') {
    return {
      id: 'fix-payout',
      title: 'Fix the bank details so your money can move',
      body:
        snapshot.payout.failedReason ??
        'The last payout was returned. Until the account is corrected the money stays with NasTech.',
      cta: 'Update bank details',
      href: '/payouts',
      learnMore: 'You will need to sign in again before the account can be changed.',
    };
  }
  if (handover) {
    return {
      id: 'schedule-handover',
      title: 'Schedule the handover',
      body: `The buyer has paid ${formatCents(handover.blockingValue)}. The money is held by NasTech until you both confirm the exchange in person.`,
      cta: 'Pick a time and place',
      href: handover.href,
      learnMore: 'The buyer cannot collect until a meet-up is confirmed.',
    };
  }
  if (snapshot.listings.byStage.draft > 0) {
    return {
      id: 'finish-draft',
      title: snapshot.listings.byStage.draft === 1 ? 'Finish your draft listing' : 'Finish your draft listings',
      body: 'A draft is not visible to buyers. The condition record and photographs are what a dispute would read, so they are the two steps that matter.',
      cta: 'Continue draft',
      href: '/listings/new',
      learnMore: null,
    };
  }
  if (snapshot.listings.byStage.live === 0 && snapshot.listings.byStage.in_review === 0) {
    return {
      id: 'first-listing',
      title: 'List your first watch',
      body: 'A listing needs a category, a condition record and at least three photographs. It takes about 12 minutes.',
      cta: 'Start a listing',
      href: '/listings/new',
      learnMore: 'You can stop at any step and come back on any device.',
    };
  }
  if (snapshot.orders.waitingOnYou > 0) {
    const order = snapshot.orders.recent.find((o) => o.state === 'PAID' || o.state === 'HANDOVER_CONFIRMED');
    if (order) {
      return {
        id: `order-${order.id}`,
        title: 'An order is waiting on you',
        body: `${order.listingTitle} — ${formatCents(order.amount.cents)} is held by NasTech until the exchange is confirmed.`,
        cta: 'Open the order',
        href: `/orders/${order.id}`,
        learnMore: null,
      };
    }
  }
  if (snapshot.listings.byStage.in_review > 0) {
    return {
      id: 'waiting-review',
      title: 'Nothing needs you right now',
      body: 'Your listing is with a reviewer. We will let you know when it is live — you do not need to check back.',
      cta: 'See your listings',
      href: '/listings',
      learnMore: null,
    };
  }
  return null;
}
