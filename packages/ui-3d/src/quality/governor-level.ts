/**
 * The governor's ladder as vocabulary, not as implementation.
 *
 * It lives in `quality/` because three consumers need to agree on the names without loading the
 * scene runtime: the governor itself, the analytics envelope that records a step-down, and the
 * `--no-3d` evidence payload. `viewer/frame-governor.ts` re-exports these so existing scene-side
 * imports keep working.
 */

import type { GovernorLevel } from '@nastech/api-contracts';

export type { GovernorLevel };

export const LEVEL_LADDER: readonly GovernorLevel[] = ['full', 'dpr', 'pixel', 'lod', 'stopped'];
