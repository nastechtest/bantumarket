# Checkout & payment (brief 14)

Critical route class. Zero reach to `three` / `@react-three/*` / `@nastech/ui-3d/*` in any shape —
enforced by the repo fence and pinned here by `no-3d.test.ts` (source scan + fence subprocess).

## What this feature promises

1. **One click → one intent.** `double-charge.test.ts` drives the real session over the transport
   seam with a backend that succeeds server-side while the client times out, then repeats the
   submit, retries, back-navigates and remounts: exactly one payment intent ever exists. The
   mechanism is `idempotency.ts` (nonce persisted per order; same intent → same key) plus the
   session's synchronous reentry lock. A fresh key exists only after the SERVER reports the old
   intent terminally `failed`.
2. **Money is the ledger's.** Every amount is a branded `Cents`/`Money` from
   `@nastech/api-contracts`, rendered only through `@nastech/design-system`'s `MoneyText`. The UI
   never prices anything: `fees.test.tsx` renders deliberately odd server totals verbatim and
   static-scans the render layer for cents arithmetic / `toFixed` / `/100`. Checked comparisons
   (`guards/price-integrity.ts`) can only block the screen, never rewrite a number.
3. **Processing is a state.** The server-truth resolver (`resolvePhase(status, lastIntent)`)
   decides what the buyer sees. The only edge into `PAID` is `PAYMENT_RECORDED` — a provider
   webhook (`Payments/RecordProviderPayment.php`) — so no button, retry or timeout path can mark
   an order paid, and a returning browser after a crash re-reads the truth instead of trusting a
   local flag (`abandon.ts` records the position; it never decides the state).
4. **No card data, ever.** Card and Instant-EFT entry happens on provider-hosted surfaces; this
   app receives only a `providerReference` string for display. There is no PAN/CVV/expiry field
   anywhere to populate, store, or leak into an error message (`error-taxonomy.ts` refuses to read
   non-`ApiError` message text).
5. **Refunds speak the ledger's language.** `REFUND_INITIATED` moves nothing
   (`Settlements/InitiateRefund.php` writes no ledger rows); only `REFUND_SETTLED` is
   money-bearing. The UI renders `REFUND_PENDING` as "money has not moved yet" — never as paid out.
6. **Refusals explain themselves.** `guards/ineligible-listing.ts` carries per-code buyer-language
   copy (what stopped it / what happened to your money / what next) because a generic error on a
   refused checkout is the biggest support cost a marketplace like this can have.

## Assumed endpoints (no HTTP layer exists yet — ADR 0002)

| Path | Method | Notes |
| --- | --- | --- |
| `/v1/orders/:orderId/checkout` | GET | `CheckoutView`: order + line items + server fee rows + commission row + offered methods + server ineligibility code + `lastIntent` |
| `/v1/orders/:orderId/payment-intents` | POST | requires `Idempotency-Key`; repeat of a spent key returns the same intent, creates nothing |
| `/v1/orders/:orderId` | GET | `OrderView` (same shape as api-client `orders.ts`) |

`api/fixtures.ts` implements all three as a `Transport` with the ledger's discipline (keyed dedupe,
webhook-only path to `PAID` via the real transition table). At integration the controller swaps
`devCheckoutApi()` in `use-checkout.ts` for `fetchTransport({ baseUrl })` — one line, marked
`CONTRACT-GAP`.

## Wiring for the controller

`routes/Checkout.tsx` (owned by this brief) renders `features/checkout/index.ts`'s default
`CheckoutFeaturePage({ route })` for the existing critical route `/checkout/:orderId`. No new route
paths are needed.
