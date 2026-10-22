import { describe, expect, test } from 'bun:test';
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { installJsdomGlobals, rootElement } from './dom-env.js';
installJsdomGlobals();

import { SceneHost } from '../scene-host.js';
import { makeCapability, makeManifest } from './fixtures.js';

/**
 * These tests exercise the STATIC branch of the composed host, which needs no GL context — and
 * that is precisely the guarantee under test: the host must reach the static path without ever
 * instantiating a canvas. The scene branch is covered in canvas-render.browser.test.tsx (skipped
 * here, real browser only).
 */
describe('SceneHost static routing (jsdom-safe)', () => {
  test('no capability: the static path renders ALONE — no canvas element is ever created', () => {
    const root = createRoot(rootElement());
    act(() => {
      root.render(
        h(SceneHost, {
          manifest: makeManifest(),
          capability: makeCapability({ gl: 'none', maxTextureSize: 0 }),
          staticPath: h('div', { id: 'static' }, 'poster + turntable + disclosures'),
          children: h('span', null, 'scene content that must never mount'),
          ariaLabel: 'watch inspection',
        }),
      );
    });
    expect(document.getElementById('static')?.textContent).toBe('poster + turntable + disclosures');
    expect(document.querySelector('canvas')).toBeNull();
    expect(document.body.textContent).not.toContain('scene content that must never mount');
    act(() => root.unmount());
  });

  test('over-budget manifest routes to the static path, not to a spinner or an error', () => {
    const root = createRoot(rootElement());
    const heavy = makeManifest({
      renditions: [
        {
          id: 'huge', kind: 'MODEL', lod: 'lod0', bytes: 4 * 1024 * 1024,
          sha256: 'h', bucketKey: 'k', mime: 'model/gltf-binary',
        },
      ],
    });
    act(() => {
      root.render(
        h(SceneHost, {
          manifest: heavy,
          capability: makeCapability(),
          staticPath: h('div', { id: 'static' }, 'complete static path'),
          children: h('span', null, 'scene-body'),
          ariaLabel: 'watch inspection',
        }),
      );
    });
    expect(document.getElementById('static')).not.toBeNull();
    expect(document.body.textContent).not.toContain('scene-body');
    act(() => root.unmount());
  });

  test('a poster-only manifest routes to the static path for the honest reason (no MODEL rendition)', () => {
    const root = createRoot(rootElement());
    act(() => {
      root.render(
        h(SceneHost, {
          manifest: makeManifest({ renditions: [] }),
          capability: makeCapability(),
          staticPath: h('div', { id: 'static' }, 'poster only'),
          children: h('span', null, 'ignored'),
          ariaLabel: 'watch inspection',
        }),
      );
    });
    expect(document.getElementById('static')?.textContent).toBe('poster only');
    expect(document.querySelector('canvas')).toBeNull();
    act(() => root.unmount());
  });

  test('save-data device: static path, and no fetch-shaped plan is built for the scene', () => {
    const root = createRoot(rootElement());
    act(() => {
      root.render(
        h(SceneHost, {
          manifest: makeManifest(),
          capability: makeCapability({ saveData: true }),
          staticPath: h('div', { id: 'static' }, 'buyer opted out of bytes'),
          children: h('span', null, 'ignored'),
          ariaLabel: 'watch inspection',
        }),
      );
    });
    expect(document.getElementById('static')?.textContent).toBe('buyer opted out of bytes');
    act(() => root.unmount());
  });
});
