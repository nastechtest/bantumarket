import { JSDOM } from 'jsdom';
import type { ConditionCaption } from '@nastech/api-contracts';
import type { CaptionCamera, Viewport } from './caption-projector.js';
import type { ConvexBounds } from './annotation-hotspot.js';
import type { Severity } from './severity-styles.js';

/**
 * Test fixtures only — imported exclusively by `*.test.ts(x)` files, so `jsdom` never rides
 * along into an app bundle.
 */

export const VIEWPORT_400: Viewport = { widthPx: 400, heightPx: 400 };

export const FRONT_CAMERA: CaptionCamera = {
  position: [0, 0, 0.5],
  target: [0, 0, 0],
  up: [0, 1, 0],
  fovDeg: 32,
  aspect: 1,
  near: 0.01,
};

/** Looking straight down the Y axis with up = +Y: the degenerate case that must stay finite. */
export const POLE_CAMERA: CaptionCamera = {
  position: [0, 0.5, 0],
  target: [0, 0, 0],
  up: [0, 1, 0],
  fovDeg: 32,
  aspect: 1,
  near: 0.01,
};

export const CASE_BOUNDS: ConvexBounds = { center: [0, 0, 0], radiusUnits: 0.02 };

export const TAN_HALF_FOV = Math.tan((32 * Math.PI) / 180 / 2);

export function makeCaption(
  hotspotId: string,
  position: readonly [number, number, number],
  over: { readonly severity?: Severity; readonly disclosureId?: string; readonly disclosureText?: string } = {},
): ConditionCaption {
  return {
    hotspotId,
    position,
    disclosureText: over.disclosureText ?? 'Crystal replaced in 2024. Timekeeping not checked.',
    severity: over.severity ?? 'unknown',
    disclosureId: over.disclosureId ?? `disc-${hotspotId}`,
  };
}

/**
 * Text content of a renderToStaticMarkup result. Decoded through jsdom because React entity-
 * escapes apostrophes in text nodes and the contract strings are the thing we compare against.
 */
export function textOf(html: string): string {
  return new JSDOM(`<body>${html}</body>`).window.document.body.textContent ?? '';
}
