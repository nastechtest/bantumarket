# ADR 0002: G5 is decided — PHP owns money and media; TypeScript owns the browser

Status: accepted (2026-10-22). Decides G5, opened in spec §14.1 and 07 §6.5.
Decided by: this session, under the user's standing instruction "build in .php".

## Decision

The media/asset backend — asset metadata, manifest issuance, capture-job state, staff QC, the mesh
worker — is written in **PHP**, in the existing modular monolith at `../nastech-market-php`, as new
modules `Media` and `Capture`. TypeScript exists in exactly one place: the browser.

## Why, when 07 §6.5 recommended the third option

The third option ("PHP owns money, TypeScript owns everything else") was my recommendation on the
merits of team shape: a 3D/webGL client team and a ledger team are not the same people. It lost on
two grounds:

1. **The user's instruction is a constraint, not a preference.** "Build in .php" was said after the
   money path existed and before the media path was written. Option three re-reads that instruction
   as "the ledger only", which is a narrower claim than the one made.
2. **Option two is the failure mode the architecture argues against.** Two runtimes means cross-boundary
   authentication, a second schema owner, and two deployables — which is precisely what
   `03-nastech-market.modules.dot` rejects for the 13-service shape. Undecided G5 was said to become
   option two by accretion; option three, adopted as an ADR, *is* option two with a document pinned to it.

One runtime, one schema owner, one migration sequence. The real cost — a PHP team doing GLB metadata
and a TS team doing the client — is the cost the plan already carries, not a new one.

## Consequences

- `packages/api-contracts/src/index.ts` stays hand-maintained. The PHP build still has **no HTTP
  layer**, so there is no OpenAPI source to generate from. That is now the largest remaining
  unbacked claim in the frontend plan: every type in that file is asserted, not derived.
- 07 §7's `apps/api` +27 files / 4,200 LOC and `apps/worker` +13 / 2,000 LOC are re-sized against the
  PHP module shape actually delivered (~136 LOC/file so far, against the model's 169), i.e. ~31 and
  ~15 files at PHP's ratio. Recorded, not re-baselined: the cost total in 05 §5 does not move,
  because the delta is inside its stated range.
- The mesh pipeline's CPU-bound work (decimation, DRACO encode, QC measurement) is *not* available
  in PHP without an external process. `Media` therefore owns job state and metadata only, and shells
  out to a native tool (Blender headless or `gltf-transform`) for geometry. That boundary must be
  written down before Phase 2 or "PHP does everything" quietly becomes "PHP spawns a hidden second
  runtime".
- `Media` is a new module in the boundary model, so `bin/check-boundaries` gains an edge to enforce:
  `Media` may not reach `Settlements` or `Commissions`. A listing's model has no business touching
  its commission entry, and the escrow rules must not learn a new way to be bypassed.

## Revisit when

An HTTP layer exists in PHP and can emit an OpenAPI document; or a native geometry pipeline is
replaced by a hosted one, which moves this from "two runtimes" to "one vendor".
