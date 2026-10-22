# ADR 0003: the scene payload measured — gate D3 closes at 217 KB gzipped

Status: accepted (2026-10-22). Closes gate D3 (07 §11), which 07 §4.2 opened by admitting its byte
figures were targets and not measurements.
Measured with `bun scripts/check-payload-budget.ts --build` in this workspace. Bun 1.3.14, Vite
5.4.11, three 0.169.0, @react-three/fiber 8.17.10, @react-three/drei 9.117.3.

## What was measured

| Chunk | Raw | Gzip | Budget | Verdict |
| --- | --- | --- | --- | --- |
| `scene` (three + fiber + drei) | 807.7 KB | **217.2 KB** | ≤ 400 KB extra JS (07 §4.2) | inside |
| `index` (entry, every route) | 134.6 KB | **43.9 KB** | ≤ 170 KB first paint (spec §13.4) | inside |
| `dist-no3d` chunks containing a `WebGLRenderer` marker | — | **0 chunks** | 0 | passes |

The scene chunk is emitted as one lazy chunk by `manualChunks`, so it is fetched on the inspect
route and nowhere else. The fence (`scripts/check-3d-boundaries.ts`) independently proves no
`critical` or `first-paint` route can reach it statically — its `--self-test` catches a direct
`@nastech/ui-3d/scene` import on a critical route, and a transitive `three` import on a first-paint
route, and passes a control where the same runtime is reached only through `import()`.

## What the numbers do NOT say

Read this part before quoting the table.

- **43.9 KB is a scaffold's entry chunk, not an item page's.** The current app is nine route modules
  of presentational markup and fixtures. The real item page will carry search, media, disclosures,
  the seller panel and the api-client. The only claim supported today is: *3D adds nothing to the
  entry chunk* — which is exactly what spec §13.4 needed protecting, and is what the two-build delta
  measures (43.9 KB with 3D available vs 46.0 KB in the NO_3D build, the difference being the stub
  versus the real but unimported tokens module).
- **217.2 KB gz is transfer, not time.** On a throttled 4G reference device that is roughly 1.4–2 s
  of network before a byte parses, and the parse is 808 KB of raw JS on a 2 GB phone — the part
  that can freeze the tab is CPU, not bytes. Gate D1's device test is still open and this ADR does
  not close it.
- **The 400 KB ceiling was set in 07 §4.2 as a promise that the resolution for breaking it is a
  smaller runtime, not a bigger budget.** It held with drei included. That is a real result: the
  plan assumed a hand-written loader might be necessary, and it is not.
- drei is ~a third of this chunk and none of it is used yet beyond nothing. If a future device test
  puts the freeze in question, dropping drei for hand-written orbit controls is the first lever, and
  it is available without touching the budget.

## Decision

The 3D route class ships with the ceilings as written: ≤ 400 KB additional JS, ≤ 2.5 MB asset,
first-paint budgets unchanged. No budget is relaxed. The scene runtime is accepted at 217 KB gz,
measured, and re-measured on every commit by `check:payload`.

## Revisit when

The reference-device CPU test (gate D1) runs, or the item page's real code lands and the entry chunk
moves above ~120 KB, at which point the 170 KB budget has to be argued with data rather than with
this table.
