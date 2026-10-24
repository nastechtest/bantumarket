# brief-13 — the 3D inspection surface and the brand scene

Buyer-facing surfaces in `apps/web-public` that consume `packages/ui-3d`. The scene is never
load-bearing: every path below lands on the complete static inspection with a one-line reason.

## How the surfaces split

| module | edge | why it lives here |
| --- | --- | --- |
| `inspect-page.tsx` | static: `ui-3d/quality` + `ui-3d/fallback` | the route; reaches the scene ONLY via `import('./scene-mount.js')` |
| `scene-mount.tsx` | lazy: `ui-3d/scene` + `ui-3d/overlays` + `ui-3d/controls` | the whole WebGL + DOM-overlay subtree, fetched on navigation to the inspect route |
| `static-path.tsx` | static: `ui-3d/fallback` | poster + turntable + written condition records + macro gallery — the sufficient path |
| `inspect-decision.ts`, `byte-gate.ts`, `quality-tier.ts`, `lod-picker.ts` | static: `ui-3d/quality` | the scene-vs-static decision, LOD/bytes pre-flight, capability-driven tier |
| `condition-overlay.tsx`, `measure-panel.tsx`, `keyboard-help.tsx`, `quality-readout.tsx`, `capture-metadata.tsx` | none / type-only | DOM wiring that injects the real overlay root rather than importing an unexported subpath |

`brand/` (hero-poster, hero-scene, category-transition, still-frame) is the ≤220 KB Home class; the
hero scene dynamic-imports the runtime only on a tap, so Home ships no `three`.

`../scenes/` is the **authored placeholder** (`PilotWatch` + `watch-case` + `crystal` +
`crown-and-lugs` + `clasp` + `materials`). It exists to prove the capture pipeline and must never be
presented as the item — the label is in the code and in `capture-metadata` / the scene caption.

## Contract gaps (see brief-13 report)

`@nastech/ui-3d/overlays` and `@nastech/ui-3d/controls` are not in the package `exports` map, so they
do not resolve today. They are consumed only from `scene-mount.tsx` (a dynamic-import-only chunk) and
typed by the ambient shims `ui3d-overlays.d.ts` / `ui3d-controls.d.ts`. The fence already classifies
them as scene edges. When the controller adds the `./overlays` and `./controls` subpath exports — and a
`src/controls/index.ts` barrel, which does not exist yet — delete both shims; the imports then resolve
against the package's own types.

## Verify

```
bun test apps/web-public/src/features/inspect apps/web-public/src/features/brand apps/web-public/src/scenes
./node_modules/.bin/tsc -p tsconfig.json --noEmit        # zero errors in these paths
bun scripts/check-3d-boundaries.ts --self-test           # green
```

`payload.test.ts` asserts the chunk *structure* (scene reached only by dynamic import; brand/inspect
ship no static scene edge). It never runs a build — byte budgets are the controller's job.
