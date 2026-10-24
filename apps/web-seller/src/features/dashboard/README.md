# Dashboard feature

Route: `/` — class `app` (no scene runtime; see `no-3d.test.ts`).

## What it does

One denormalised snapshot (`DashboardTransport.load`) drives the whole screen: the action centre,
listing status, sales, payout position, capture job and the two funnel timings. The seller's next
obligation is the first block on the page; everything else is supporting detail.

## The ordering rule

`action-order.ts` is the deliverable. Items sort lexicographically by:

1. money bucket — held money (handover, payout failure) → money at risk (capture/review refusal) →
   supply (drafts, review) → conversation;
2. blocked cents, descending;
3. deadline, ascending, absent deadlines last;
4. id, for stability.

A buyer question can never outrank an unscheduled handover, no matter how recent it is. Tests in
`action-centre.test.ts` assert exactly that, including a frozen input to prove the transport array
is not mutated.

## Numbers

`metrics-that-are-not-vanity.ts` exposes only `time_to_first_listing` and `listing_to_live` — the
two metrics brief 04's exit test measures. `VANITY_METRICS` names views, impressions, saves and
watchlists with the reason each is absent; a test pins the list so re-adding one is a deliberate
act. All money is `Money` rendered by `MoneyText`; no arithmetic happens in this directory.

## States

Loading, error (focusable summary, retry), empty seller (three-step start), loaded, offline (stale
data is kept visible with an explicit banner). The payout block distinguishes held money from
payable money and never sums them.

## Assumed endpoints

`GET /v1/seller/dashboard` — one response containing the snapshot in
`api/dashboard-transport.ts`. The PHP backend has no HTTP layer yet; an adapter replaces
`createDashboardFixture` without touching a component.

## CONTRACT-GAPs

- None blocking. The shell (brief 56) owns header/nav/main; this feature renders sections only.
