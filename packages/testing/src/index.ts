/**
 * The public surface of the test harness.
 *
 * This file exists because `package.json` already names it as `main`, `types` and `exports["."]`:
 * without it, `import { render } from '@nastech/testing'` fails to resolve and every suite is pushed
 * into subpath imports — which is what happened, and why seven features grew their own DOM installer
 * instead of sharing the one in `dom/env.ts`. Subpath imports (`@nastech/testing/render`) stay valid;
 * this only adds the door that was supposed to be there.
 *
 * Deliberately a `export *` barrel with no re-packaging: the harness has no duplicate export names, so
 * a suite that imports `installDom` here gets the same binding it would get from `./dom/env.js`, and a
 * new module becomes importable by adding one line rather than by editing a curated list that drifts.
 * Nothing here runs at import time — DOM installation, WebGL stubbing and serializer registration are
 * all explicit calls a suite makes.
 */

export * from './render.js';
export * from './providers.js';
export * from './fake-clock.js';
export * from './match-media.js';
export * from './intersection-observer.js';
export * from './resize-observer.js';
export * from './snapshot-serializer.js';
export * from './dom/env.js';
export * from './dom/events.js';
export * from './dom/pointer.js';
export * from './dom/query.js';
export * from './api/errors.js';
export * from './api/fake-transport.js';
export * from './api/record.js';
export * from './webgl/context.js';
export * from './webgl/fail-context.js';
export * from './webgl/stub.js';
export * from './fixtures/asset-manifests.js';
export * from './fixtures/items.js';
export * from './fixtures/orders.js';
export * from './fixtures/users.js';
export * from './a11y/checks.js';
export * from './a11y/color.js';
export * from './a11y/aria-registry.js';
export * from './a11y/ignore.js';
export * from './a11y/reporter.js';
export * from './a11y/audit.js';
