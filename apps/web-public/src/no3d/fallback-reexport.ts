/**
 * The static path is allowed in the NO_3D build, so it is re-exported from the real module — but
 * only the fallback directory, which imports no scene runtime. This file is the seam that proves
 * the split is real: if `@nastech/ui-3d/fallback` ever grows a dependency on `three`, this build
 * stops being 3D-free and check-payload-budget.ts goes red.
 */
export { PosterFallback, TurntableSprite } from '@nastech/ui-3d/fallback';
