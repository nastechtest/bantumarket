// Subpath imports, not the package root: the root index pulls the React transition hook and the
// parallax module, and this file's output goes into the first-paint stylesheet.
import { durations, easing } from '@nastech/motion/tokens';
import { motionVarNames } from '@nastech/motion/css-vars';
import { REDUCE_QUERY } from '@nastech/motion/reduced-motion';

/**
 * The reduced-motion stylesheet, generated — this is what replaces the
 * `*{animation-duration:0.001ms !important}` sledgehammer in `styles.css`, and the whole point of
 * generating it instead of hand-writing is the exception baked into @nastech/motion's contract:
 * reduction makes state-change feedback *instant*, it never makes it *absent*. A blanket
 * `!important` on `*` cannot express that difference (it also flattens any component that
 * legitimately overrides motion), so this block:
 *
 *   1. zeroes the brand duration variables and eases — everything that respects tokens stops
 *      moving on its own, with no selector arms race;
 *   2. targets chrome (this package's own classes) with plain `:where()` rules at zero
 *      specificity, so a component can still opt back in for `feedback` motion;
 *   3. switches off ambient flourish marked `[data-nt-ambient]`;
 *   4. kills smooth scrolling, which is motion the user never asked for.
 *
 * Emitters: the controller pastes `reducedMotionCss()` into `styles.css` (build step or a
 * committed generated block). No `!important` appears in the output — layering.test.ts asserts it.
 */
export function reducedMotionCss(): string {
  const zeroDurations = (Object.keys(durations) as (keyof typeof durations)[]).map(
    (name) => `  ${motionVarNames.duration(name)}: 0ms;`,
  );
  const linearEases = (Object.keys(easing) as (keyof typeof easing)[]).map(
    (name) => `  ${motionVarNames.ease(name)}: linear;`,
  );

  return [
    `@media ${REDUCE_QUERY} {`,
    '  /* Durations zeroed, not motion paused: a state change still repaints, instantly.',
    '     This is the @nastech/motion `feedback` exception expressed in CSS. */',
    '  :root {',
    ...zeroDurations,
    ...linearEases,
    '  }',
    '  :where(.nt-header, .nt-tab-bar__item, .nt-offline-banner) {',
    '    transition: none;',
    '    animation: none;',
    '  }',
    '  :where([data-nt-ambient]) {',
    '    animation: none;',
    '    transition: none;',
    '  }',
    '  :where(html) {',
    '    scroll-behavior: auto;',
    '  }',
    '}',
  ].join('\n');
}
