# Buyer search and browse (brief 11)

Search is how the pilot survives or dies: 04's exit test measures time-to-first-listing and
listing→live conversion, and 07 §6.4 requires that **no ranking, badge or layout weight favours
3D listings**. This directory makes that rule testable, not quotable.

## The parity proof

`ranking/rank.ts` scores items through an explicit field projection (`projectForRanking`) that
contains no `has3d` field — the scored shape cannot address "3D-ness" at all. `ranking/parity.ts`
is the only ranking entry point the UI uses. `parity.test.ts` proves three things over one fixed
corpus (18 listings, mixed `has3d`):

1. **Invariance** — rotating and flipping the `has3d` assignment keeps the ranked id sequence
   byte-identical under every sort, and the comparators are total orders (id tiebreak), so input
   order cannot smuggle a dependency in.
2. **Blinding** — ranking runs over `Proxy`-wrapped items that *throw* the moment `has3d` is
   read; a future "boost rich listings" change fails in review, not in production.
3. **Non-vacuity** — the same permutation technique on `price` and `postedAt` **changes** the
   order. An order-blind ranker would pass (1) while being broken; it cannot pass (3).

## Zero ≠ failed

`api-client`'s `SearchOutcome` arrives as `results | no_matches | failed`, and this feature keeps
those three states in three screens: `zero-result/zero-result.tsx` (supply signal: echoes the
query, offers one broadening action, marks itself `data-supply-signal`) and
`zero-result/no-index-yet.tsx` (our bug: "Search is not answering", retry, never a count).
`search.test.tsx` asserts neither screen can contain the other's words. A failed search never
renders "0 listings" — the pilot's supply plan reads that sentence as demand missing, and it
would be a lie.

## Facet counts

Counts come from the response (`SearchFacet`), which the fake server computes the way a facet
server must: for facet F, over items matching everything *except* F. Zero-count values stay
visible (and inert unless selected) rather than vanishing — a selected filter that disappears is
un-deselectable, and a recounted page is the classic lie. See `facet counts on screen` in
`search.test.tsx`.

## URL state

`url-state.ts` is the whole state: `q`, `sort`, price range, four multi-facets, cursor. Defaults
are dropped, facet values are sorted on serialisation (click order must not change a shared
link), hostile params are dropped rather than honoured. A shared link reproduces a search exactly
(`url-state.test.ts`, end-to-end against the fake transport).

## Transport and the absence of a server

There is no HTTP layer yet (ADR 0002). Components import `ListingSearchTransport`
(`api/search-transport.ts`) — never `fetch`. The app default is `fakeListingSearch`
(`api/fixtures.ts`); when the backend lands, `apiListingSearchTransport` over an api-client
`Transport` replaces it without touching a component.

## Contract gaps

`SearchListing` extends the wire `ListingSummary` with optional `condition`, `locationSlug`,
`postedAt` — none of these exist in `@nastech/api-contracts` yet. The UI hides meta lines when
absent rather than inventing values. Marked `// CONTRACT-GAP:` in `types.ts` and
`api/search-transport.ts`.

## Mobile & motion

320px single column (container-query grid from the design system), 44px targets throughout,
filters in a bottom `Sheet` (focus-trapped, scroll-locked) — not a mouse-assuming sidebar. The
skeleton shimmer is `motionOk('decorative')`: under prefers-reduced-motion the placeholders stay,
the animation does not exist.

## Files

Pure logic: `types.ts`, `url-state.ts`, `pagination.ts`, `suggest.ts`, `ranking/{rank,parity}.ts`,
`facets/facet-state.ts`, `zero-result/related-categories.ts`.
Components: `search-page.tsx`, `search-bar.tsx`, `facets/*`, `results/*`, `zero-result/*`.
Data: `api/{search-transport,fixtures}.ts`. Wiring: `index.ts` (default Page), wired from
`routes/Search.tsx`. Tests: `{search,parity,facets,url-state,zero-result}.test.*`,
`tests/dom-env.ts` (jsdom bootstrap mirroring design-system's).
