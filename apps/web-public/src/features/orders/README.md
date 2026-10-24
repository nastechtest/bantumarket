# orders & handover (feature docs)

Both features are `critical` route classes: no scene runtime, statically or lazily, in the whole
import closure — enforced by `no-scene-runtime.test.ts` here and by `scripts/check-3d-boundaries.ts`
at the route edge.

## Where the state vocabulary comes from

`state-labels.ts` is total over the ledger's order machine as transcribed in
`nastech-market-php/src/Orders/Order.php` and mirrored by `@nastech/api-client`
(`ORDER_TRANSITIONS`, `MONEY_BEARING_ORDER_EVENTS`). The names are:

```
AWAITING_PAYMENT → PAID → HANDOVER_SCHEDULED → HANDOVER_CONFIRMED → COMPLETED
CANCELLED · REFUND_PENDING → REFUNDED · IN_DISPUTE
```

Two properties the UI must never soften, both tested in `order-status.test.ts`:

- **`REFUND_INITIATED` is an event, not a state, and it is not money-bearing.** The only visible
  refund-request state is `REFUND_PENDING`, labelled "Refund requested — money not yet returned".
  A screen that renders the request as movement is lying to a seller (`Order::isMoneyBearing`).
- **Nothing on these screens can mark an order PAID.** The only edge into PAID is
  `PAYMENT_RECORDED` (provider webhook). The handover PIN advances `HANDOVER_SCHEDULED →
  HANDOVER_CONFIRMED`; release happens at `COMPLETED`.

Times are SAST (UTC+2, no DST) and server-derived; `handover/window-validity.ts` is the single
pure kernel, and every displayed deadline carries the literal string "SAST".

## Assumed endpoints (all CONTRACT-GAP — the PHP ledger has no HTTP layer yet, ADR 0002)

Orders (`api/orders-transport.ts`):

- `GET /v1/orders?role=buyer|seller[&include_closed=]`
- `GET /v1/orders/{orderId}` — row shape `OrderRow`
- `POST /v1/orders/{orderId}/cancel` with `Idempotency-Key`

Handover (`handover/api/handover-transport.ts`):

- `GET /v1/orders/{orderId}/handover` → `HandoverTokenView | 404`
- `GET /v1/handover/venues` — assumed venue catalogue (pilot city Cape Town; fixture list)
- `GET /v1/handover/slots?orderId=` → slots **plus the server's `now`** (client never decides
  which slots are past from a device clock)
- `POST /v1/orders/{orderId}/handover/schedule` (Idempotency-Key) → token + plaintext PIN, once
- `POST /v1/handover-tokens/{tokenId}/present { pin }` — no role in the body, ever
  (`ConfirmHandover::handle` derives the actor from the principal)
- `POST /v1/orders/{orderId}/handover/report-no-show` → refund *request* (`moneyMovedNow: false`)

Other gaps, marked inline:

- `OrderRow.listingTitle` — order rows need an embedded title; `OrderView` has only `listingId`.
- Photo proof has no upload endpoint; the component is capture-and-label only and never blocks.
- `raiseDispute` has no server module; every "open a review" affordance links to the
  `/dispute/:orderId` route the Dispute feature owns, and no money claims are made from here.
- No-show refund settlement "2–5 working days" is support copy, not a ledger guarantee.

## Routes needed (controller wires these)

- `/orders` — critical — `features/orders/index.ts` default `Page`
- `/orders/:orderId` — critical — same `Page` (it branches on the pathname)
- `/handover/:orderId` — exists — now backed by `routes/Handover.tsx` → `features/handover`

## Test seams

Fixtures expose an injectable *server* clock (`serverNow`, `setServerNow`) because every
window/validity decision is server-derived; tests move the server, never the device.
`window.test.ts` additionally poisons the local `Date` getters to prove the kernel never reads a
device timezone.
