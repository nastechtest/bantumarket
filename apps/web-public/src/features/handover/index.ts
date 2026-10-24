import { createElement } from 'react';
import type { RouteDef } from '../../router.js';
import { HandoverFeaturePage } from './handover-page.js';

/**
 * Feature entry per the wave-b route contract (`export default function Page({ route })`).
 * The page body is in `handover-page.tsx`; this file is a `.ts`, so `createElement` stands in
 * for JSX. The router wires this at `/handover/:orderId` (critical class — the scene runtime
 * is fenced out of the whole graph below).
 */
export default function Page({ route }: { route: RouteDef }) {
  return createElement(HandoverFeaturePage, { route });
}

export { HandoverPage, HandoverFeaturePage } from './handover-page.js';
export { evaluateWindow, formatSast, parseServerInstant, describeWindow, windowStatusLine, remainingLabel } from '../../lib/window-validity.js';
export type { WindowEvaluation, WindowStatus, SastMoment } from '../../lib/window-validity.js';
