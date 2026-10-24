import { money } from '@nastech/api-contracts';
import type { HandoverConfirmation } from '@nastech/api-client';
import { parseServerInstant } from '../../../lib/window-validity.js';
import type {
  HandoverSlot,
  HandoverTokenView,
  SlotOffer,
  HandoverTransport,
  HandoverVenue,
  NoShowReport,
  PresentPinResult,
  ScheduleResult,
} from './handover-transport.js';

/**
 * Fixture handover backend, behaviour-mirroring `nastech-market-php/src/Handover`:
 * two-sided presentation, an attempt cap of `HandoverToken::MAX_ATTEMPTS`, revocation on
 * reissue, expiry on the *server* clock (injectable), and a plaintext PIN that exists only in
 * the schedule response. Nothing here reads the device clock.
 */

export const MAX_ATTEMPTS = 5; // HandoverToken::MAX_ATTEMPTS
export const FIXTURE_PIN = '284619'; // six digits, no repeated run — the generator's own filter

/**
 * Safe exchange venues for the pilot city. CONTRACT-GAP: no venue endpoint exists server-side;
 * this list is assumed fixture data for Cape Town (the single pilot city), and the venue picker
 * must degrade to "enter the meeting place freely" when the list is empty rather than block.
 */
export const HANDOVER_VENUES: readonly HandoverVenue[] = [
  {
    id: 'ven_cpb_city',
    name: 'Cape Town Central Police Station — transfer point',
    area: 'Central',
    safetyNote: 'Staffed 24/7, camera-covered forecourt; exchanges happen in the public transfer area.',
    staffed: true,
  },
  {
    id: 'ven_waterfront',
    name: 'V&A Waterfront — information desk forecourt',
    area: 'Atlantic Seaboard',
    safetyNote: 'Busy, lit until late, private security patrolling; keep the exchange in the open forecourt.',
    staffed: true,
  },
  {
    id: 'ven_woodstock_library',
    name: 'Woodbridge Library plaza',
    area: 'Woodstock',
    safetyNote: 'Open plaza with staffed desk nearby; daylight slots only — the plaza empties after 18:00.',
    staffed: false,
  },
  {
    id: 'ven_goodwood_square',
    name: 'Goodwood Gateway food court entrance',
    area: 'Northern Suburbs',
    safetyNote: 'Mall security at the entrance, cameras overhead; meet by the entrance, not in the parking lot.',
    staffed: true,
  },
  {
    id: 'ven_tygerberg_crossing',
    name: 'Tygerberg Valley Mall — customer service doors',
    area: 'Bellville',
    safetyNote: 'Staffed doors and lighting until mall close; avoid the lower parking decks entirely.',
    staffed: true,
  },
];

/** Builds a SAST ATOM string without touching any device timezone. */
export function sastIso(year: number, month: number, day: number, hour: number, minute: number): string {
  const epoch = Date.UTC(year, month - 1, day, hour, minute) - 120 * 60_000;
  return new Date(epoch).toISOString().replace('Z', '+02:00').replace(/\.\d{3}/, '');
}

export type HandoverScenario =
  | 'unscheduled'
  | 'open'
  | 'closing_edge'
  | 'expired'
  | 'buyer_presented'
  | 'complete'
  | 'locked'
  | 'revoked';

interface TokenRecord {
  tokenId: string;
  orderId: string;
  pin: string;
  opensAtMs: number;
  expiresAtMs: number;
  buyerConfirmed: boolean;
  sellerConfirmed: boolean;
  attempts: number;
  locked: boolean;
  revoked: boolean;
  heldCents: number;
  venueId: string | null;
  slot: HandoverSlot | null;
  version: number;
}

const BASE_SERVER_NOW = parseServerInstant('2026-10-08T12:00:00+02:00');
const HOUR = 3_600_000;

function makeToken(scenario: HandoverScenario, orderId: string): TokenRecord | null {
  const base: TokenRecord = {
    tokenId: 'hdt_fixture01',
    orderId,
    pin: FIXTURE_PIN,
    opensAtMs: BASE_SERVER_NOW - 2 * HOUR,
    expiresAtMs: BASE_SERVER_NOW + 4 * HOUR,
    buyerConfirmed: false,
    sellerConfirmed: false,
    attempts: 0,
    locked: false,
    revoked: false,
    heldCents: 585_000, // R5,850 — a pre-owned watch clears the R2,700 capture-viability line by design
    venueId: 'ven_cpb_city',
    slot: { id: 'slot_1', startIso: sastIso(2026, 10, 8, 10, 0), endIso: sastIso(2026, 10, 8, 16, 0) },
    version: 1,
  };
  switch (scenario) {
    case 'unscheduled':
      return null;
    case 'open':
      return base;
    case 'closing_edge':
      return { ...base, expiresAtMs: BASE_SERVER_NOW + 60_000 };
    case 'expired':
      return { ...base, opensAtMs: BASE_SERVER_NOW - 4 * HOUR, expiresAtMs: BASE_SERVER_NOW - 10 * 60_000 };
    case 'buyer_presented':
      return { ...base, buyerConfirmed: true };
    case 'complete':
      return { ...base, buyerConfirmed: true, sellerConfirmed: true };
    case 'locked':
      return { ...base, attempts: MAX_ATTEMPTS, locked: true };
    case 'revoked':
      return { ...base, revoked: true };
  }
}

export interface FixtureHandoverOptions {
  readonly scenario: HandoverScenario;
  readonly orderId?: string;
  /** The principal the gateway would derive; fixtures must still not accept a body-supplied role. */
  readonly actingRole?: 'buyer' | 'seller';
  readonly serverNow?: () => number;
}

export function createFixtureHandoverTransport(
  options: FixtureHandoverOptions,
): HandoverTransport & {
    /** Test seams: move the SERVER clock, count presentations, read the acting role. */
    readonly presentCalls: number;
    setServerNow(ms: number): void;
  } {
  const orderId = options.orderId ?? 'ord_03';
  const actingRole = options.actingRole ?? 'buyer';
  let now = options.serverNow ?? (() => BASE_SERVER_NOW);
  let token = makeToken(options.scenario, orderId);
  let presentCalls = 0;

  const SLOTS: readonly HandoverSlot[] = [
    { id: 'slot_a', startIso: sastIso(2026, 10, 9, 10, 0), endIso: sastIso(2026, 10, 9, 12, 0) },
    { id: 'slot_b', startIso: sastIso(2026, 10, 9, 12, 0), endIso: sastIso(2026, 10, 9, 14, 0) },
    { id: 'slot_c', startIso: sastIso(2026, 10, 9, 14, 0), endIso: sastIso(2026, 10, 9, 16, 0) },
  ];

  function view(t: TokenRecord): HandoverTokenView {
    return {
      tokenId: t.tokenId,
      orderId: t.orderId,
      opensAtIso: isoSast(t.opensAtMs),
      expiresAtIso: isoSast(t.expiresAtMs),
      serverNowIso: isoSast(now()),
      buyerConfirmed: t.buyerConfirmed,
      sellerConfirmed: t.sellerConfirmed,
      attemptsRemaining: Math.max(0, MAX_ATTEMPTS - t.attempts),
      locked: t.locked,
      revoked: t.revoked,
      heldBuyerTotal: money(t.heldCents),
      venueId: t.venueId,
      slot: t.slot,
    };
  }

  return {
    get presentCalls() {
      return presentCalls;
    },
    setServerNow(ms: number) {
      now = () => ms;
    },
    async getActiveHandover(requested) {
      requireOrder(requested, orderId);
      return token === null ? null : view(token);
    },
    async listVenues() {
      return HANDOVER_VENUES;
    },
    async listSlots(requested): Promise<SlotOffer> {
      requireOrder(requested, orderId);
      // Slots on the day after "today" (server clock), 10:00–16:00 SAST in two-hour windows,
      // stamped with the server's now so "which slots are past" is never the device's call.
      return { slots: SLOTS, serverNowIso: isoSast(now()) };
    },
    async scheduleHandover(requested, input): Promise<ScheduleResult> {
      requireOrder(requested, orderId);
      // Mirror ScheduleHandover: reissue is legal from an existing token, first issue replaces none.
      if (token !== null) throw new Error('This order already has a handover scheduled — reissue instead.');
      const slot = SLOTS.find((s) => s.id === input.slotId);
      if (!slot) throw new Error('That slot is no longer bookable.');
      if (!HANDOVER_VENUES.some((v) => v.id === input.venueId)) throw new Error('Unknown venue.');
      token = {
        tokenId: 'hdt_new01',
        orderId,
        pin: FIXTURE_PIN,
        opensAtMs: parseServerInstant(slot.startIso),
        expiresAtMs: parseServerInstant(slot.endIso),
        buyerConfirmed: false,
        sellerConfirmed: false,
        attempts: 0,
        locked: false,
        revoked: false,
        heldCents: 585_000,
        venueId: input.venueId,
        slot,
        version: 1,
      };
      return { token: view(token), pin: FIXTURE_PIN };
    },
    async reissueHandover(requested): Promise<ScheduleResult> {
      requireOrder(requested, orderId);
      if (token === null) throw new Error('Nothing to reissue — schedule the handover first.');
      const durationMs = token.expiresAtMs - token.opensAtMs;
      const newExpires = now() + durationMs;
      token = {
        ...token,
        tokenId: `hdt_${token.version + 1}`,
        pin: FIXTURE_PIN,
        opensAtMs: now(),
        expiresAtMs: newExpires,
        buyerConfirmed: false,
        sellerConfirmed: false,
        attempts: 0,
        locked: false,
        revoked: false,
        version: token.version + 1,
      };
      return { token: view(token), pin: FIXTURE_PIN };
    },
    async presentPin(requested, pin): Promise<PresentPinResult> {
      requireOrder(requested, orderId);
      presentCalls++;
      if (token === null) throw new Error('No handover is scheduled for this order.');
      const t = token;
      // The order HandoverToken::present checks things in; the messages the party sees differ.
      if (t.revoked) return { kind: 'revoked' };
      if (t.locked) return { kind: 'locked' };
      if (t.buyerConfirmed && t.sellerConfirmed) return { kind: 'already_presented' };
      if (now() >= t.expiresAtMs) return { kind: 'expired' };
      const alreadyForMe = actingRole === 'buyer' ? t.buyerConfirmed : t.sellerConfirmed;
      if (alreadyForMe) return { kind: 'already_presented' };

      if (!/^\d{6}$/.test(pin) || pin !== t.pin) {
        t.attempts++;
        if (t.attempts >= MAX_ATTEMPTS) {
          t.locked = true;
          return { kind: 'locked' };
        }
        return { kind: 'wrong_pin', attemptsRemaining: MAX_ATTEMPTS - t.attempts };
      }

      if (actingRole === 'buyer') t.buyerConfirmed = true;
      else t.sellerConfirmed = true;
      const complete = t.buyerConfirmed && t.sellerConfirmed;
      const confirmation: HandoverConfirmation = {
        accepted: true,
        complete,
        awaiting: complete ? null : t.buyerConfirmed ? 'seller' : 'buyer',
        attemptsRemaining: MAX_ATTEMPTS - t.attempts,
        locked: false,
      };
      return { kind: 'recorded', confirmation };
    },
    async reportNoShow(requested): Promise<NoShowReport> {
      requireOrder(requested, orderId);
      // REFUND_INITIATED is not money-bearing (`Order::isMoneyBearing`): the request opens the
      // pending state; settlement moves money. The fixture cannot settle — no endpoint assumes it.
      return { orderId: requested, refundRequested: true, moneyMovedNow: false, moneyPosition: 'held' };
    },
  };
}

function requireOrder(requested: string, mine: string): void {
  if (requested !== mine) throw new Error(`No handover data for ${requested} in this fixture.`);
}

/** epoch → ATOM at +02:00, no device timezone involved anywhere. */
function isoSast(ms: number): string {
  return new Date(ms).toISOString().replace('Z', '+02:00').replace(/\.\d{3}/, '');
}

export { BASE_SERVER_NOW };
