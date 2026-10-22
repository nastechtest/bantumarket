import { createContext, createElement, useContext, useEffect, useState, type ReactElement, type ReactNode } from 'react';

/**
 * Disposal registry (07 §4.1 `viewer/`, failure mode 1: the undisposed GL context).
 *
 * R3F disposes what IT created. It does not dispose a `new THREE.CylinderGeometry()` you memoised
 * in a component body, nor any texture hanging off a material you built by hand — and each of
 * those pins GPU buffers until the tab dies. On the 2 GB reference device that is how a listing
 * page becomes a killed renderer. Everything a scene creates must therefore register with the
 * host and be disposed exactly once when the host tears down.
 */

export interface Disposable {
  dispose(): void;
}

export interface DisposalRegistry {
  /** Returns an unregister fn so a resource can leave the registry before teardown. */
  register<T extends Disposable>(resource: T, label?: string): () => void;
  disposeAll(): void;
  readonly size: number;
}

export function createDisposalRegistry(): DisposalRegistry {
  const entries = new Map<number, { resource: Disposable; label: string }>();
  let nextId = 1;
  return {
    register<T extends Disposable>(resource: T, label = 'anonymous'): () => void {
      const id = nextId++;
      entries.set(id, { resource, label });
      return () => {
        entries.delete(id);
      };
    },
    disposeAll(): void {
      // Clear first, dispose second: a dispose() that throws must not orphan the entries after it
      // (they would never be attempted again) and must not re-run on a second disposeAll pass.
      const list = [...entries.values()];
      entries.clear();
      for (const entry of list) {
        try {
          entry.resource.dispose();
        } catch {
          /* one bad resource must not block the rest of the teardown */
        }
      }
    },
    get size(): number {
      return entries.size;
    },
  };
}

/** Structural types so this module never imports three: the registry must be testable with no GL. */
interface NodeLike {
  readonly geometry?: Disposable;
  readonly material?: Disposable | readonly Disposable[];
}
interface GraphRoot {
  traverse(callback: (node: NodeLike) => void): void;
}

const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'] as const;

function isDisposable(value: unknown): value is Disposable {
  return typeof value === 'object' && value !== null && typeof (value as Disposable).dispose === 'function';
}

/**
 * Register every geometry/material/texture under a scene-graph root. Called on mount of
 * hand-built content and on load completion of GLB subtrees — the ones R3F will not clean up.
 */
export function registerSceneGraph(registry: DisposalRegistry, root: GraphRoot): void {
  root.traverse((node) => {
    if (node.geometry) registry.register(node.geometry, 'geometry');
    const materials = node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : [];
    for (const material of materials) {
      registry.register(material, 'material');
      for (const slot of TEXTURE_SLOTS) {
        const texture = (material as unknown as Record<string, unknown>)[slot];
        if (isDisposable(texture)) registry.register(texture, `texture:${slot}`);
      }
    }
  });
}

const DisposalRegistryContext = createContext<DisposalRegistry | null>(null);

export interface DisposalProviderProps {
  readonly registry: DisposalRegistry;
  readonly children: ReactNode;
}

export function DisposalProvider({ registry, children }: DisposalProviderProps): ReactElement {
  return createElement(DisposalRegistryContext.Provider, { value: registry }, children);
}

interface Entry<T extends Disposable> {
  resource: T;
  disposed: boolean;
}

/**
 * Stable-across-renders disposable, disposed on unmount. If it registers with a surrounding host
 * registry, teardown is ordered child-first, so disposeAll never double-disposes. Under StrictMode
 * the effect is set up → cleaned up → set up again on the SAME component instance; the disposed
 * flag exists so the remount mints a fresh resource instead of rendering a disposed one.
 */
export function useDisposable<T extends Disposable>(factory: () => T): T {
  const registry = useContext(DisposalRegistryContext);
  const [entry, setEntry] = useState<Entry<T>>(() => ({ resource: factory(), disposed: false }));

  useEffect(() => {
    if (entry.disposed) {
      setEntry({ resource: factory(), disposed: false });
      return;
    }
    const unregister = registry ? registry.register(entry.resource) : undefined;
    return () => {
      entry.disposed = true;
      unregister?.();
      entry.resource.dispose();
    };
  }, [entry, registry]);

  return entry.resource;
}

/** Access to the host registry for imperative registration (loaded GLB subtrees, etc.). */
export function useDisposalRegistry(): DisposalRegistry | null {
  return useContext(DisposalRegistryContext);
}
