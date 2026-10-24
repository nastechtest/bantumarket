import { afterEach, describe, expect, test } from 'bun:test';
import { act, createElement as h, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AnimationClip, BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { installDom } from '@nastech/testing';
import { GltfAsset, type MixerFactory } from '../../assets/model-loader.js';
import { makeManifest } from './fixtures.js';

installDom();

interface MixerCalls {
  created: number;
  plays: number;
  updates: number;
  stops: number;
  uncachedRoots: number;
  uncachedClips: number;
  disposed: number;
}

function zeroCalls(): MixerCalls {
  return { created: 0, plays: 0, updates: 0, stops: 0, uncachedRoots: 0, uncachedClips: 0, disposed: 0 };
}

function mixerSpy(calls: MixerCalls): MixerFactory {
  return () => {
    calls.created += 1;
    return {
      clipAction: () => ({
        play() {
          calls.plays += 1;
        },
        setEffectiveTimeScale() {
          /* recorded by plays; the generated clips run at 1x */
        },
      }),
      update() {
        calls.updates += 1;
      },
      stopAllAction() {
        calls.stops += 1;
      },
      uncacheRoot() {
        calls.uncachedRoots += 1;
      },
      uncacheClip() {
        calls.uncachedClips += 1;
      },
      dispose() {
        calls.disposed += 1;
      },
    };
  };
}

interface Fixture {
  readonly gltf: GLTF;
  readonly disposed: { geometry: number; material: number; texture: number };
}

function fakeGltf(): Fixture {
  const scene = new Group();
  scene.name = 'fixture-root';
  const geometry = new BoxGeometry();
  const texture = new Texture();
  const material = new MeshStandardMaterial({ map: texture });
  const disposed = { geometry: 0, material: 0, texture: 0 };
  geometry.addEventListener('dispose', () => {
    disposed.geometry += 1;
  });
  material.addEventListener('dispose', () => {
    disposed.material += 1;
  });
  texture.addEventListener('dispose', () => {
    disposed.texture += 1;
  });
  scene.add(new Mesh(geometry, material));
  const gltf = {
    scene,
    scenes: [scene],
    animations: [new AnimationClip('inspect-turntable', 10, [])],
    cameras: [],
    asset: { version: '2.0' },
    parser: {},
    userData: {},
  } as unknown as GLTF;
  return { gltf, disposed };
}

interface Mounted {
  readonly root: Root;
  readonly container: HTMLElement;
  live: boolean;
}

const mounted: Mounted[] = [];

function mount(ui: ReactElement): Mounted {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  const entry: Mounted = { root, container, live: true };
  mounted.push(entry);
  return entry;
}

function unmount(entry: Mounted): void {
  if (!entry.live) return;
  entry.live = false;
  act(() => entry.root.unmount());
  entry.container.remove();
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

afterEach(() => {
  for (const entry of mounted.splice(0)) unmount(entry);
});

describe('GltfAsset', () => {
  test('reduced motion renders the first frame and never constructs a mixer', async () => {
    const { gltf, disposed } = fakeGltf();
    const calls = zeroCalls();
    let rendered = 0;
    const view = mount(
      h(GltfAsset, {
        url: '/assets/models/wristwatch.gltf',
        manifest: makeManifest(),
        alt: 'Wristwatch',
        reducedMotion: true,
        load: async () => gltf,
        createMixer: mixerSpy(calls),
        children: () => {
          rendered += 1;
          return h('span', { 'data-testid': 'scene' }, 'first frame');
        },
      }),
    );

    await settle();

    expect(calls.created).toBe(0);
    expect(rendered).toBeGreaterThan(0);
    expect(view.container.querySelector('[data-model-state="ready"]')?.getAttribute('data-model-mixer')).toBe('none');
    expect(view.container.querySelector('[data-model-clip]')?.getAttribute('data-model-clip')).toBe(
      'inspect-turntable',
    );

    unmount(view);
    expect(disposed).toEqual({ geometry: 1, material: 1, texture: 1 });
  });

  test('motion path constructs one mixer and releases it on unmount', async () => {
    const { gltf } = fakeGltf();
    const calls = zeroCalls();
    const view = mount(
      h(GltfAsset, {
        url: '/assets/models/parka.gltf',
        manifest: makeManifest(),
        alt: 'Parka',
        reducedMotion: false,
        load: async () => gltf,
        createMixer: mixerSpy(calls),
        requestFrame: () => 0,
        children: () => null,
      }),
    );

    await settle();

    expect(calls.created).toBe(1);
    expect(calls.plays).toBe(1);
    expect(view.container.querySelector('[data-model-state="ready"]')?.getAttribute('data-model-mixer')).toBe(
      'active',
    );

    unmount(view);
    expect(calls).toMatchObject({ stops: 1, uncachedRoots: 1, uncachedClips: 1, disposed: 1 });
  });

  test('a failed load renders the poster fallback and never throws', async () => {
    const errors: unknown[] = [];
    let thrown = false;
    const view = mount(
      h(GltfAsset, {
        url: '/assets/models/missing.gltf',
        manifest: makeManifest(),
        alt: 'Missing watch',
        reducedMotion: true,
        load: () => Promise.reject(new Error('offline')),
        onError: (error: unknown) => errors.push(error),
        children: () => null,
      }),
    );

    try {
      await settle();
    } catch {
      thrown = true;
    }

    expect(thrown).toBe(false);
    expect(errors).toHaveLength(1);
    expect(view.container.querySelector('.nt-poster')).not.toBeNull();
    expect(view.container.querySelector('[data-model-state]')).toBeNull();
  });

  test('a load that resolves after unmount disposes the scene instead of leaking it', async () => {
    const { gltf, disposed } = fakeGltf();
    let resolveLoad: (value: GLTF) => void = () => undefined;
    const load = () =>
      new Promise<GLTF>((resolve) => {
        resolveLoad = resolve;
      });
    const view = mount(
      h(GltfAsset, {
        url: '/assets/models/smartphone.gltf',
        manifest: makeManifest(),
        alt: 'Smartphone',
        reducedMotion: true,
        load,
        children: () => null,
      }),
    );

    unmount(view);
    resolveLoad(gltf);
    await settle();

    expect(disposed).toEqual({ geometry: 1, material: 1, texture: 1 });
  });
});
