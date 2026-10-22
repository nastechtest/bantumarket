/**
 * Scene entry point. Anything reachable from here pulls the WebGL runtime, so the fence treats
 * `@nastech/ui-3d/scene` and `@nastech/ui-3d` (which re-exports it) as the same forbidden edge.
 */
export { CanvasHost } from './canvas-host.js';
export type { CanvasHostProps } from './canvas-host.js';
