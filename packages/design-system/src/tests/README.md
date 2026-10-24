# design-system tests

How this suite is wired and why, for the next person (or agent) who adds a file here.

## Runner and DOM

`bun test packages/design-system` is the runner — no vitest. Tests that mount components import
`./dom-setup.js` **first** (before `react-dom/client`), which installs a jsdom `window`/`document`
plus `IS_REACT_ACT_ENVIRONMENT`. Pure-markup tests use `renderToStaticMarkup` and need no setup;
prefer it — it is faster and cannot leak DOM state between tests.

The mount idiom (`createRoot` + `act`, `afterEach` clearing `document.body`) is copied from the
committed `sheet.test.tsx`; keep that shape so future greps find one pattern.

## The two fences

- `forbidden-imports.test.ts` — nothing in this package may reach `@nastech/ui-3d` / `three` /
  `@react-three` (first-paint budget) or `@nastech/testing` / `@nastech/i18n` / `@nastech/forms`
  (wave-B concurrency). It scans import *shapes* (static, bare, dynamic, require) and carries
  injection fixtures; extend the fixtures whenever you extend the prefix list.
- `token-literals.test.ts` — no hex, no numeric `px` (except the committed `1px solid` hairline
  precedent), no rgba/hsl literals, no shadows, no numeric `z-index` in `overlay/ data/ nav/
  feedback/ patterns/`. Z-stacking comes from `overlay/layer.ts` only. It also scans *injected*
  violations so the guard cannot rot into a no-op.

Both fences follow the same rule as `scripts/check-3d-boundaries.ts`: a guard that never fires on
an injected violation proves nothing, so every guard here has positive and negative fixtures.

## Accessibility assertions, not claims

`modal`, `focus-trap`, `menu`, `tabs`, `table` and `confirm-destructive` assert the behaviour:
Tab/Shift+Tab wrap points, Escape routing, focus return to the opener, `inert` + `aria-hidden` on
the background and *not* on the panel, disabled-item skipping in the roving ring, `aria-sort` only
on the actively sorted column, and a destructive confirm that stays locked until every consequence
is affirmed. Where a rule is claimed in a comment, there is a test that would fail if it stopped
being true.

## Reduced motion

`motionOk` from `@nastech/motion` is the only gate (`overlay/anim.ts`, `feedback/skeleton.tsx`,
`feedback/toast.tsx`). Tests drive it with `setReducedMotionOverride(true|false)` and reset to
`null` in `afterEach`. The contract under test: reduction removes flourish, never a state change —
a toast with reduced motion still appears, instantly.
