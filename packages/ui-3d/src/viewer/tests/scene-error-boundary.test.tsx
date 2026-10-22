import { describe, expect, test } from 'bun:test';
import { act, Component, createElement as h, type ReactElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { installJsdomGlobals, rootElement } from './dom-env.js';
installJsdomGlobals();

import { SceneErrorBoundary } from '../scene-error-boundary.js';

/** Records what the DOM actually shows — the contract is "the buyer sees the static path". */
function staticPathMarker(): ReactElement {
  return h('div', { id: 'static-path' }, 'poster + turntable + disclosures');
}

function Throwing({ message }: { message: string }): ReactElement {
  throw new Error(message);
}

/** A stand-in outer app boundary: proves escalation reaches it rather than being swallowed. */
class OuterBoundary extends Component<{ children: ReactNode }, { caught: string | null }> {
  override state: { caught: string | null } = { caught: null };
  static getDerivedStateFromError(error: Error): { caught: string } {
    return { caught: error.message };
  }
  override render(): ReactNode {
    if (this.state.caught !== null) return h('div', { id: 'outer' }, `outer saw: ${this.state.caught}`);
    return this.props.children;
  }
}

function withConsoleErrorsSilenced<T>(run: () => T): T {
  // React logs every caught error via console.error; the noise would bury real failures.
  const original = console.error;
  console.error = () => undefined;
  try {
    return run();
  } finally {
    console.error = original;
  }
}

describe('scene-error-boundary', () => {
  test('a throw during scene construction renders the COMPLETE static path, not an error message', () => {
    withConsoleErrorsSilenced(() => {
      const root = createRoot(rootElement());
      act(() => {
        root.render(
          h(SceneErrorBoundary, { sceneActive: true, fallback: staticPathMarker(), children: h(Throwing, { message: 'bad geometry' }) }),
        );
      });
      const el = document.getElementById('static-path');
      expect(el).not.toBeNull();
      expect(el?.textContent).toBe('poster + turntable + disclosures');
      expect(document.body.textContent).not.toContain('bad geometry');
      act(() => root.unmount());
    });
  });

  test('onSceneError fires once with the real error for telemetry', () => {
    withConsoleErrorsSilenced(() => {
      const seen: string[] = [];
      const root = createRoot(rootElement());
      act(() => {
        root.render(
          h(
            SceneErrorBoundary,
            {
              sceneActive: true,
              fallback: staticPathMarker(),
              onSceneError: (e: Error) => seen.push(e.message),
              children: h(Throwing, { message: 'loader exploded' }),
            },
          ),
        );
      });
      expect(seen).toEqual(['loader exploded']);
      act(() => root.unmount());
    });
  });

  test('sceneActive=false escalates to the app boundary instead of swallowing (outside-scene throw)', () => {
    withConsoleErrorsSilenced(() => {
      const root = createRoot(rootElement());
      act(() => {
        root.render(
          h(OuterBoundary, {
            children: h(SceneErrorBoundary, { sceneActive: false, fallback: staticPathMarker(), children: h(Throwing, { message: 'app bug in static content' }) }),
          }),
        );
      });
      const outer = document.getElementById('outer');
      expect(outer?.textContent).toContain('app bug in static content');
      // The scene boundary did NOT hijack it into the fallback:
      expect(document.getElementById('static-path')).toBeNull();
      act(() => root.unmount());
    });
  });

  test('a throw in a sibling OUTSIDE the boundary goes to the app boundary, never into the fallback', () => {
    withConsoleErrorsSilenced(() => {
      const root = createRoot(rootElement());
      act(() => {
        root.render(
          h(
            OuterBoundary,
            {
              children: h('div', null, [
                h(SceneErrorBoundary, { sceneActive: true, fallback: staticPathMarker(), key: 'b', children: h('span', null, 'scene ok') }),
                h(Throwing, { message: 'elsewhere-in-app', key: 't' }),
              ]),
            },
          ),
        );
      });
      const outer = document.getElementById('outer');
      expect(outer?.textContent).toContain('elsewhere-in-app');
      expect(document.getElementById('static-path')).toBeNull();
      act(() => root.unmount());
    });
  });

  test('healthy scene children render untouched and no fallback exists in the DOM', () => {
    const root = createRoot(rootElement());
    act(() => {
      root.render(
        h(SceneErrorBoundary, { sceneActive: true, fallback: staticPathMarker(), children: h('span', { id: 'scene' }, 'watch model') }),
      );
    });
    expect(document.getElementById('scene')?.textContent).toBe('watch model');
    expect(document.getElementById('static-path')).toBeNull();
    act(() => root.unmount());
  });
});
