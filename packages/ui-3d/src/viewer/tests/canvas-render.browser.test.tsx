import { test } from 'bun:test';

// The merged ambient `bun:test` declaration is function-form (no `.skip` member); the runtime
// (bun) fully supports test.skip. Cast rather than fake a pass.
const skip = (test as unknown as { skip: (name: string, fn: () => void) => void }).skip;

/**
 * The honest gap, stated plainly instead of faked: everything in this file needs a REAL WebGL
 * context and can only pass in a browser (gate D1's device run, or Playwright with a GL-backed
 * Chromium). jsdom provides no canvas context — `failIfMajorPerformanceCaveat` plus
 * `powerPreference` are GPU-driver features with no jsdom equivalent, so asserting anything here
 * in jsdom would be theatre.
 *
 * What the browser run must prove, in order:
 *  1. CanvasHost mounts, onReady fires, and SceneHost marks 'scene-ready' telemetry.
 *  2. WEBGL_lose_context.loseContext() → context-loss tracker goes live → lost, the host swaps to
 *     the COMPLETE static path and never re-mounts the canvas (terminal for the session).
 *  3. Unmounting a mounted scene drops the renderer to zero live programs/textures (disposal:
 *     `gl.getProgramCount`-style checks or Chrome's `--enable-gpu-memory-buffer-compositor`).
 *  4. The governor's DPR step visibly reduces the drawing buffer size.
 */
skip('scene branch renders a live WebGL canvas and reports ready (REQUIRES REAL BROWSER)', () => {
  // Not executable in jsdom — see the doc comment. Deliberately empty; the skip is the statement.
});

skip('webglcontextlost event routes through the tracker to the static path (REQUIRES REAL BROWSER)', () => {
  // Drive WEBGL_lose_context in a page; assert tracker.transitions === idle->live, live->lost.
});
