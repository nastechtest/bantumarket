import { describe, expect, test } from 'bun:test';
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { installJsdomGlobals, rootElement } from './dom-env.js';
installJsdomGlobals();

import {
  VisibilityGate,
  frameloopForVisibility,
  type GateCallback,
  type GateObserver,
  type GateObserverFactory,
} from '../visibility-gate.js';

/**
 * jsdom has no IntersectionObserver; the gate's whole contract lives behind the injected
 * observerFactory, so the fake exercises the REAL component including its effects.
 */
function fakeGate(): { factory: GateObserverFactory; fire: (visible: boolean) => void; disconnected: { count: number } } {
  let callback: GateCallback | null = null;
  const disconnected = { count: 0 };
  const observer: GateObserver = {
    observe: () => undefined,
    disconnect: () => {
      disconnected.count++;
    },
  };
  const factory: GateObserverFactory = (cb) => {
    callback = cb;
    return observer;
  };
  return {
    factory,
    fire: (visible: boolean) => {
      if (!callback) throw new Error('observer was never constructed');
      callback({ isIntersecting: visible, intersectionRatio: visible ? 1 : 0 }, document.createElement('div'));
    },
    disconnected,
  };
}

describe('visibility-gate', () => {
  test('off-screen maps the frameloop to never: the loop STOPS, it is not merely slowed', () => {
    expect(frameloopForVisibility(true)).toBe('demand');
    expect(frameloopForVisibility(false)).toBe('never');
  });

  test('mounting visible renders the scene; scrolling off-screen flips the render-prop', () => {
    const gate = fakeGate();
    const states: boolean[] = [];
    const root = createRoot(rootElement());
    act(() =>
      root.render(
        h('div', null, h(VisibilityGate, {
          observerFactory: gate.factory,
          children: (visible: boolean) => {
            states.push(visible);
            return h('span', { id: `vis-${String(visible)}` }, 'scene');
          },
        })),
      ),
    );

    expect(states).toEqual([true]);
    expect(document.querySelector('[data-scene-visible]')?.getAttribute('data-scene-visible')).toBe('true');

    act(() => {
      gate.fire(false);
    });
    expect(states).toEqual([true, false]);
    expect(document.querySelector('[data-scene-visible]')?.getAttribute('data-scene-visible')).toBe('false');

    act(() => {
      gate.fire(true);
    });
    expect(states.at(-1)).toBe(true);
    act(() => root.unmount());
    expect(gate.disconnected.count).toBe(1);
  });

  test('onChange fires only on REAL transitions — a grid of six gates must not get spammed', () => {
    const gate = fakeGate();
    const changes: boolean[] = [];
    const root = createRoot(rootElement());
    act(() => {
      root.render(
        h(VisibilityGate, {
          observerFactory: gate.factory,
          onChange: (v: boolean) => changes.push(v),
          children: () => h('span', null, 'x'),
        }),
      );
    });
    act(() => {
      gate.fire(false);
      gate.fire(false);
      gate.fire(false);
    });
    expect(changes).toEqual([false]); // deduped: three identical entries, one transition
    act(() => {
      gate.fire(true);
      gate.fire(false);
    });
    expect(changes).toEqual([false, true, false]);
    act(() => root.unmount());
  });

  test('no IntersectionObserver in the environment does not hide the scene (rule 1: static path is not a punishment)', () => {
    const states: boolean[] = [];
    const nullFactory: GateObserverFactory = () => null;
    const root = createRoot(rootElement());
    act(() => {
      root.render(
        h(VisibilityGate, {
          observerFactory: nullFactory,
          children: (visible: boolean) => {
            states.push(visible);
            return h('span', null, 'scene');
          },
        }),
      );
    });
    expect(states).toEqual([true]);
    act(() => root.unmount());
  });
});
