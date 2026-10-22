import { describe, expect, test } from 'bun:test';
import { act, createElement as h, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { installJsdomGlobals, rootElement } from './dom-env.js';
installJsdomGlobals();

import {
  createDisposalRegistry,
  registerSceneGraph,
  DisposalProvider,
  useDisposable,
  type Disposable,
} from '../disposal-registry.js';

class Counted implements Disposable {
  disposals = 0;
  dispose(): void {
    this.disposals++;
  }
}

function track(): { created: Counted[]; factory: () => Counted } {
  const created: Counted[] = [];
  return {
    created,
    factory: () => {
      const d = new Counted();
      created.push(d);
      return d;
    },
  };
}

function Leaf({ factory }: { factory: () => Counted }) {
  useDisposable(factory);
  return null;
}

function tree(registry: ReturnType<typeof createDisposalRegistry>, factory: () => Counted): ReactElement {
  return h(DisposalProvider, { registry, children: h(Leaf, { factory }) });
}

describe('disposal-registry + useDisposable', () => {
  test('a resource created under a host is disposed EXACTLY once when the host unmounts', () => {
    const registry = createDisposalRegistry();
    const t = track();
    const root: Root = createRoot(rootElement());
    act(() => root.render(tree(registry, t.factory)));
    expect(t.created).toHaveLength(1);
    expect(registry.size).toBe(1);

    act(() => root.unmount());
    expect(t.created[0]?.disposals).toBe(1);
    expect(registry.size).toBe(0); // children unregister before the parent tears down
  });

  test('the object is stable across re-renders: a fresh inline factory must NOT re-create it', () => {
    const registry = createDisposalRegistry();
    const t = track();
    const root = createRoot(rootElement());
    act(() => root.render(tree(registry, t.factory)));
    act(() => root.render(tree(registry, t.factory))); // second render, new closure, same hook state
    expect(t.created).toHaveLength(1);
    act(() => root.unmount());
    expect(t.created[0]?.disposals).toBe(1);
  });

  test('the memoised-in-body leak scenario: a remount never reuses the disposed resource', () => {
    const registry = createDisposalRegistry();
    const t = track();
    const first = createRoot(rootElement());
    act(() => first.render(tree(registry, t.factory)));
    act(() => first.unmount());

    const second = createRoot(rootElement());
    act(() => second.render(tree(registry, t.factory)));
    expect(t.created).toHaveLength(2);
    expect(t.created[1]?.disposals).toBe(0); // the live one is live
    act(() => second.unmount());
    expect(t.created[0]?.disposals).toBe(1);
    expect(t.created[1]?.disposals).toBe(1);
  });

  test('registry.disposeAll disposes each registered entry once; unregistered entries are left alone', () => {
    const registry = createDisposalRegistry();
    const a = new Counted();
    const b = new Counted();
    registry.register(a, 'a');
    const unregister = registry.register(b, 'b');
    unregister();
    registry.disposeAll();
    expect(a.disposals).toBe(1);
    expect(b.disposals).toBe(0);
    registry.disposeAll();
    expect(a.disposals).toBe(1); // second pass finds nothing — no double-dispose
  });

  test('a throwing dispose does not orphan the resources after it', () => {
    const registry = createDisposalRegistry();
    const bad: Disposable = {
      dispose() {
        throw new Error('gpu buffer confused');
      },
    };
    const good = new Counted();
    registry.register(bad, 'bad');
    registry.register(good, 'good');
    registry.disposeAll();
    expect(good.disposals).toBe(1);
  });

  test('registerSceneGraph catches geometry, materials AND their textures — the R3F gap', () => {
    const registry = createDisposalRegistry();
    const geometry = new Counted();
    const texture = new Counted();
    const material = Object.assign(new Counted(), { map: texture });
    const rootLike = {
      traverse(cb: (node: Record<string, unknown>) => void): void {
        cb({ geometry, material });
      },
    } as unknown as Parameters<typeof registerSceneGraph>[1];
    registerSceneGraph(registry, rootLike);
    expect(registry.size).toBe(3);
    registry.disposeAll();
    expect(geometry.disposals).toBe(1);
    expect(material.disposals).toBe(1);
    expect(texture.disposals).toBe(1);
  });

  test('two components under one host share the registry and both are disposed on teardown', () => {
    const registry = createDisposalRegistry();
    const t1 = track();
    const t2 = track();
    const root = createRoot(rootElement());
    act(() => {
      root.render(h(DisposalProvider, { registry, children: [h(Leaf, { factory: t1.factory, key: 'x' }), h(Leaf, { factory: t2.factory, key: 'y' })] }));
    });
    expect(registry.size).toBe(2);
    act(() => root.unmount());
    expect(t1.created[0]?.disposals).toBe(1);
    expect(t2.created[0]?.disposals).toBe(1);
    expect(registry.size).toBe(0);
  });
});
