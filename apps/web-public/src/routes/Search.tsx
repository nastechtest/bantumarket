/**
 * Route seam for /search — owned by brief 11 and deliberately one line.
 *
 * The page implementation lives in `features/search/` (index.ts). Keeping this file a pure
 * re-export means the fence in `scripts/check-3d-boundaries.ts` classifies exactly what the
 * `/search` route (class: first-paint) reaches: the feature directory and the shared packages
 * it imports — never the scene runtime, statically or dynamically.
 */
export { default } from '../features/search/index.js';
