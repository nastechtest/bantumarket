# features/item — the first-paint item page

The product page for one listing. It is complete on its own: photographs, a 12-frame turntable
built from the capture strip, the written condition record, the claim-scope sentence, the seller
tier, price, safety notes and the buy path. **No file in this directory imports `three`,
`@react-three/*` or `@nastech/ui-3d` — not even `/fallback`** — and `tests/fence.test.ts` fails
any edit that changes that, in all four import shapes. The 3D model is a *navigation*
(`/item/:id/inspect`, owned by brief 13); a buyer who never taps it is missing nothing.

## Layout of the directory

| File | Job |
| --- | --- |
| `index.ts` | feature entry (`export default` page for `routes/ItemPage.tsx`), listing-id resolution, loading/error arms, SEO application |
| `item-page.tsx` | pure composition of the finished page (props in, markup out — what the tests render) |
| `use-item.ts` | transport fetch with stale-generation cancellation; `loading/ready/failed` arms |
| `item-error.tsx` | `not_found`/`network`/`server`/`validation` said apart, with retry |
| `media/gallery.tsx` | photos ↔ turntable tabs, thumbnails, keyboard nav |
| `media/poster.tsx` | first-paint hero image; a failed jpg degrades into words, never a grey box |
| `media/turntable.ts` | the 12-frame drag/keyboard state machine (pure math exported separately) |
| `media/zoom-on-tap.ts` | tap-to-magnify origin maths (clamped so the inspected mark can't leave frame) |
| `media/frame-indicator.tsx` | 12 dots + "Frame 3 of 12" text for screen readers and tests |
| `condition/*` | the written record: chips (refusing off-vocabulary severities), per-record blocks, the list |
| `condition/what-this-does-not-say.tsx` | `CLAIM_SCOPE_DISCLOSURE[scope]` verbatim; no tick, glow or "verified" (§13.2) |
| `seller/*` | panel via `VerificationBadge`, tier explainer from `TIER_LABELS`, honest response-time copy |
| `buy/*` | buy bar (escrow sentence, "3D inspected" as fact), question box, save toggle, share with real outcomes |
| `safety/*` | meeting-safety instructions + `PolicyLinks`; report flow with a closed reason vocabulary |
| `schema.ts` / `price-format.ts` | JSON-LD `Product`+`Offer`; ZAR rendered by integer arithmetic only |
| `seo.ts` | document head writer (pure `itemSeoFields` + DOM `applyItemSeo`) |
| `api/item-transport.ts` | the DTO and transport seam (`ItemDetail` is a marked CONTRACT-GAP) |
| `api/fixtures.ts` | three pilot listings: captured, never-captured, out-of-stock |

## Rules this directory exists to keep

1. **3D is never load-bearing.** `tests/no-3d.test.tsx` renders the page in a process without any
   GL surface and asserts every condition claim is present as text.
2. **A render is not evidence.** `tests/claim-scope.test.tsx` pins the disclosure to the contract
   table and scans the markup for banned trust affordances.
3. **Badges are claims.** Tiers render only through `VerificationBadge`; severities only through
   `SeverityChip`, which refuses off-vocabulary values the same way.
4. **Money is cents.** Prices flow through `Money`/`money()`; JSON-LD uses `zarMajorMinor`, never
   `cents/100`.

## Wiring notes for the controller

- `routes/ItemPage.tsx` re-exports `features/item/index.js`'s default; no new route path is needed.
- The buy button links `/checkout/:listingId` (the pilot convention: checkout resolves or creates
  the order). If checkout wants a real order id, change `checkoutHrefFor` only.
- Assumed endpoints (no HTTP layer exists, ADR 0002): `GET /v1/listings/:id/detail`,
  `POST /v1/listings/:id/questions`, `POST /v1/listings/:id/reports`.
- `ItemDetail`, `StillImage`, `ConditionRecord` are local CONTRACT-GAP types built from contract
  primitives; move them to `@nastech/api-contracts` when the detail DTO lands.
