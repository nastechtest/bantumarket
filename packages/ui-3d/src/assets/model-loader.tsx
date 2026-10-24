import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AnimationMixer,
  type AnimationClip,
  type BufferGeometry,
  type Group,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AssetManifest } from '@nastech/api-contracts';
import { PosterFallback } from '../fallback/static-path.js';

/**
 * glTF asset loader (07 §4.1). Three responsibilities, each with a failure mode it prevents:
 *
 *  1. Load with `GLTFLoader` and play the document's clip through an `AnimationMixer`. The model's
 *     animation is authored on nodes, so the mixer is the only thing that has to run per frame.
 *  2. Honour reduced motion. Under `prefers-reduced-motion: reduce` the scene is placed at its
 *     authored rest pose (the clip's first frame) and NO mixer is constructed — not a paused one,
 *     which would still allocate and still advance on a stray `update`.
 *  3. Fail soft. A 404, a malformed document or a loader that throws synchronously renders the
 *     existing poster fallback; it never throws into the scene tree. The written condition
 *     disclosures stay beside that poster, which is why the fallback is complete rather than a
 *     blank box.
 *
 * Disposal covers geometry, every material, every texture reachable from those materials, and the
 * mixer (actions stopped, clip/root uncached). It also covers a load that resolves after unmount:
 * the scene is disposed immediately instead of leaking until the tab closes.
 */

export interface MixerActionLike {
  play(): void;
  setEffectiveTimeScale?(scale: number): unknown;
}

/** Structural mixer surface: the component never reaches past what it uses and tests can spy. */
export interface MixerLike {
  clipAction(clip: AnimationClip): MixerActionLike;
  update(deltaSeconds: number): void;
  stopAllAction(): unknown;
  uncacheRoot(root: Object3D): unknown;
  uncacheClip(clip: AnimationClip): unknown;
  dispose?(): void;
}

export type MixerFactory = (root: Object3D) => MixerLike;
export type GltfLoad = (url: string) => Promise<GLTF>;

export interface GltfAssetRenderInfo {
  readonly mixer: MixerLike | null;
  readonly clipName: string | null;
  readonly reducedMotion: boolean;
}

export interface GltfAssetProps {
  /** Model URL — build it with `resolveAssetUrl(id)` so the deployment base is applied. */
  readonly url: string;
  /** Manifest for the poster fallback. The poster is part of the same capture as the model. */
  readonly manifest: AssetManifest;
  readonly alt: string;
  /**
   * `undefined` reads the OS preference (same query as `probeCapability`), `true`/`false` forces a
   * branch. An explicit value is what a test or the no-3D CI render passes.
   */
  readonly reducedMotion?: boolean;
  /** Clip name or index to play. Defaults to the document's first clip. */
  readonly clip?: string | number;
  readonly timeScale?: number;
  readonly className?: string;
  /** Render prop for the parsed scene. Omit for a headless loader that only fetches/plays. */
  readonly children?: (scene: Group, info: GltfAssetRenderInfo) => ReactNode;
  readonly onReady?: (info: GltfAssetRenderInfo) => void;
  readonly onError?: (error: unknown) => void;
  /** Test seams; production uses the three defaults. */
  readonly load?: GltfLoad;
  readonly createMixer?: MixerFactory;
  readonly now?: () => number;
  readonly requestFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelFrame?: (handle: number) => void;
}

/** Mirrors `probeCapability().prefersReducedMotion`; kept local so the loader never probes WebGL. */
export function prefersReducedMotion(win: Window | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  return win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function loadGltfWithThree(url: string): Promise<GLTF> {
  return import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new GLTFLoader().loadAsync(url));
}

function isTexture(value: unknown): value is Texture {
  return typeof value === 'object' && value !== null && (value as { isTexture?: unknown }).isTexture === true;
}

/**
 * Dispose everything a GLB owns. Three does not do this for a subtree you attach yourself, and a
 * pinned geometry is a GPU buffer that survives until the context dies.
 */
export function disposeSceneGraph(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((node) => {
    const candidate = node as Object3D & {
      geometry?: BufferGeometry;
      material?: Material | Material[];
    };
    if (candidate.geometry) geometries.add(candidate.geometry);
    const list = candidate.material
      ? Array.isArray(candidate.material)
        ? candidate.material
        : [candidate.material]
      : [];
    for (const material of list) {
      materials.add(material);
      for (const value of Object.values(material as unknown as Record<string, unknown>)) {
        if (isTexture(value)) textures.add(value);
      }
    }
  });
  for (const texture of textures) {
    try {
      texture.dispose();
    } catch {
      /* one bad texture must not leave the rest of the graph pinned */
    }
  }
  for (const material of materials) {
    try {
      material.dispose();
    } catch {
      /* keep disposing */
    }
  }
  for (const geometry of geometries) {
    try {
      geometry.dispose();
    } catch {
      /* keep disposing */
    }
  }
}

/** Stop the actions and drop the mixer's caches; `dispose` is called when a mixer offers one. */
export function releaseMixer(mixer: MixerLike, root: Group, clip: AnimationClip | null): void {
  try {
    mixer.stopAllAction();
  } catch {
    /* stopping is best-effort during teardown */
  }
  if (clip) {
    try {
      mixer.uncacheClip(clip);
    } catch {
      /* keep releasing */
    }
  }
  try {
    mixer.uncacheRoot(root);
  } catch {
    /* keep releasing */
  }
  try {
    mixer.dispose?.();
  } catch {
    /* keep releasing */
  }
}

function selectClip(animations: readonly AnimationClip[], selector: string | number | undefined): AnimationClip | null {
  if (animations.length === 0) return null;
  if (selector === undefined) return animations[0] ?? null;
  if (typeof selector === 'number') return animations[selector] ?? null;
  return animations.find((clip) => clip.name === selector) ?? animations[0] ?? null;
}

const defaultNow = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());
const defaultRequestFrame = (callback: FrameRequestCallback): number =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : 0;
const defaultCancelFrame = (handle: number): void => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
};
const defaultMixer: MixerFactory = (root) => new AnimationMixer(root);

type LoadState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly url: string;
      readonly scene: Group;
      readonly mixer: MixerLike | null;
      readonly clipName: string | null;
      readonly reduced: boolean;
    }
  | { readonly status: 'error' };

export function GltfAsset({
  url,
  manifest,
  alt,
  reducedMotion,
  clip,
  timeScale = 1,
  className,
  children,
  onReady,
  onError,
  load,
  createMixer,
  now,
  requestFrame,
  cancelFrame,
}: GltfAssetProps): ReactNode {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const reduced = reducedMotion ?? prefersReducedMotion();

  // Imperative seams live in refs so an inline callback prop cannot retrigger the load effect.
  const loadRef = useRef(load);
  const mixerRef = useRef(createMixer);
  const nowRef = useRef(now);
  const requestRef = useRef(requestFrame);
  const cancelRef = useRef(cancelFrame);
  const readyRef = useRef(onReady);
  const errorRef = useRef(onError);
  loadRef.current = load;
  mixerRef.current = createMixer;
  nowRef.current = now;
  requestRef.current = requestFrame;
  cancelRef.current = cancelFrame;
  readyRef.current = onReady;
  errorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let loadedScene: Group | null = null;
    let mixer: MixerLike | null = null;
    let selectedClip: AnimationClip | null = null;

    setState({ status: 'loading' });

    const run = async (): Promise<void> => {
      try {
        const gltf = await (loadRef.current ?? loadGltfWithThree)(url);
        if (cancelled) {
          disposeSceneGraph(gltf.scene);
          return;
        }
        loadedScene = gltf.scene;
        selectedClip = selectClip(gltf.animations, clip);

        // Reduced motion: the rest pose IS the first frame, so attaching the scene is enough.
        // No mixer is constructed, which is the assertion the loader test makes.
        if (!reduced && selectedClip) {
          mixer = (mixerRef.current ?? defaultMixer)(gltf.scene);
          const action = mixer.clipAction(selectedClip);
          action.play();
          if (timeScale !== 1) action.setEffectiveTimeScale?.(timeScale);
        }

        setState({
          status: 'ready',
          url,
          scene: gltf.scene,
          mixer,
          clipName: selectedClip?.name ?? null,
          reduced,
        });
        try {
          readyRef.current?.({
            mixer,
            clipName: selectedClip?.name ?? null,
            reducedMotion: reduced,
          });
        } catch {
          /* an observer must not break the loaded scene */
        }
      } catch (error) {
        if (mixer && loadedScene) releaseMixer(mixer, loadedScene, selectedClip);
        mixer = null;
        if (loadedScene) disposeSceneGraph(loadedScene);
        loadedScene = null;
        if (cancelled) return;
        setState({ status: 'error' });
        try {
          errorRef.current?.(error);
        } catch {
          /* the poster fallback is the contract, not the observer */
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (mixer && loadedScene) releaseMixer(mixer, loadedScene, selectedClip);
      if (loadedScene) disposeSceneGraph(loadedScene);
    };
    // Deliberately only the inputs that change WHAT is loaded. Callback props are read via refs.
  }, [url, reduced, clip, timeScale]);

  const active = state.status === 'ready' && state.url === url ? state : null;

  useEffect(() => {
    if (!active?.mixer) return;
    const mixer = active.mixer;
    const clock = nowRef.current ?? defaultNow;
    const request = requestRef.current ?? defaultRequestFrame;
    const cancel = cancelRef.current ?? defaultCancelFrame;
    let stopped = false;
    let handle: number | null = null;
    let last = clock();

    const tick: FrameRequestCallback = () => {
      if (stopped) return;
      const current = clock();
      const delta = Math.min(Math.max((current - last) / 1000, 0), 0.1);
      last = current;
      try {
        mixer.update(delta);
      } catch {
        stopped = true;
        return;
      }
      handle = request(tick);
    };
    handle = request(tick);

    return () => {
      stopped = true;
      if (handle !== null) cancel(handle);
    };
  }, [active?.mixer]);

  if (state.status === 'error') {
    return <PosterFallback manifest={manifest} alt={alt} />;
  }

  if (!active) return null;

  return (
    <div
      className={className}
      data-model-state="ready"
      data-model-mixer={active.mixer ? 'active' : 'none'}
      data-model-clip={active.clipName ?? ''}
    >
      {children
        ? children(active.scene, {
            mixer: active.mixer,
            clipName: active.clipName,
            reducedMotion: active.reduced,
          })
        : null}
    </div>
  );
}
