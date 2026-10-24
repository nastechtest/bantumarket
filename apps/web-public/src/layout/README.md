# App shell — layout, styles, bootstrap, chrome lib

The frame every public page hangs in: header, footer, nav, tab bar, skip link, consent slot,
and the promise the app makes when the network is gone. Owned by brief 25; `router.tsx`,
`main.tsx`, `styles.css`, `index.html`, `vite.config.ts` are controller-owned.

## What lands where

- `layout/` — chrome components. They style themselves from `@nastech/design-tokens` inline;
  position/stack rules live only in `styles/layering.css`. Icons are the five in `icons.tsx`
  (inline SVG, `aria-hidden`, currentColor) — there is no icon font and adding one is a
  budget incident, not a preference (`fence.test.ts` fails on it).
- `styles/` — the seven global sheets. `reduced-motion.ts` exports `reducedMotionCss()`:
  drop that string into `styles.css` **in place of** the
  `@media (prefers-reduced-motion:reduce){*{... !important}}` line. It zeroes the brand motion
  variables instead of every animation in the document, so `feedback` motion (handover
  completed, dispute filed) still repaints — instantly — per the @nastech/motion contract.
- `bootstrap/` — provider tree, error boundary, boot timing, flags, env, support contact,
  error-reporter slot. Nothing here fetches data or loads third-party scripts at first paint;
  `sentry-slot.ts` is an interface you attach a real sink to *after* consent.
- `lib/` — storage, clipboard, share, broadcast bus, online status, deep links. All total
  (never throw at the call site), all injectable for tests.

## Wiring the controller must land (code here already assumes it)

1. `styles.css`: import/concatenate `styles/reset.css`, `scale.css`, `type.css`, `layering.css`,
   `motion.css` (then `print.css`, `high-contrast.css`), replace the reduced-motion `!important`
   line with `reducedMotionCss()` output; emit @nastech/motion's `motionCss()` variables for
   `motion.css` to consume.
2. `index.html`: `<link rel="manifest" href="/manifest.webmanifest">`,
   `<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">`.
3. `router.tsx` `App()`: wrap the page in `<AppFrame activePath={route.path} routeLabel={route.label}
   account={...} support={supportContact()}>`; register `/sell`, `/account`, `/account/orders`,
   `/legal/humans` (nav/footer reference them; until wired they hit the NotFound route).
4. Service worker (outside this brief): fall back to `/offline.html`.

## The offline contract (test-backed, not vibes)

`lib/online-status.ts` owns the store; the chrome renders an "You are offline" banner (`role=status`),
a header dot with words, and a buy bar that stays present but disabled **with a reason** wired via
`aria-describedby`. Payments are never queued, flagged off in `feature-flags.ts`
(`pay.offlineQueue: false`) and not actually consultable anywhere — the disabled path is
unconditional. `public/offline.html` repeats the promise for cache misses and has no script to
break it with.

## Budget rules

- Nothing in `layout/**`, `bootstrap/**`, `lib/**`, `styles/*.ts` may import `three`,
  `@react-three/*`, `@nastech/ui-3d/*` — `fence.test.ts` enforces this on the files, in all four
  import shapes, with an injection self-test.
- No `@import`, no remote `url()`, no `@font-face` without `font-display: optional` in chrome CSS.
- z-index: one scale in `layering.css`, every reference is `var(--nt-z-<layer>)`;
  `layering.test.ts` parses the CSS and fails on free-styled numbers, undefined layers, or
  `zIndex` inline in a component.
- CONTRACT-GAP (for the controller): design-tokens has no z-layer module yet; the scale lives in
  `styles/layering.css` and is the single source until you promote it to `design-tokens`.
