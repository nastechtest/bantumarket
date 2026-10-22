import { describe, expect, it } from 'bun:test';
import { cancelOnRouteChange, createCancellationScope, type CancellationScope } from './cancellation.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createCancellationScope', () => {
  it('starts live, with an abort signal the transport can honour', () => {
    const scope = createCancellationScope();
    expect(scope.cancelled).toBe(false);
    expect(scope.reason).toBeNull();
    expect(scope.signal.aborted).toBe(false);
  });

  it('records which of the three endings killed it', () => {
    const cases: Array<ReturnType<typeof createCancellationScope>> = [
      createCancellationScope(),
      createCancellationScope(),
      createCancellationScope(),
    ];
    cases[0]!.cancel('unmount');
    cases[1]!.cancel('route-change');
    cases[2]!.cancel('byte-budget');
    expect(cases.map((c) => c.reason)).toEqual(['unmount', 'route-change', 'byte-budget']);
    expect(cases.every((c) => c.signal.aborted)).toBe(true);
  });

  it('aborts the signal so an in-flight fetch actually stops', () => {
    const scope = createCancellationScope();
    let seen = false;
    scope.signal.addEventListener('abort', () => {
      seen = true;
    });
    scope.cancel('unmount');
    expect(seen).toBe(true);
  });

  it('ignores a second cancel rather than rewriting the reason', () => {
    const scope = createCancellationScope();
    scope.cancel('byte-budget');
    scope.cancel('route-change');
    expect(scope.reason).toBe('byte-budget');
  });
});

describe('scope.settle — a cancelled fetch cannot resolve into state', () => {
  it('drops a value that lands after the buyer left', async () => {
    const scope = createCancellationScope();
    const slow = deferred<{ geometry: string }>();
    let applied = 0;
    const state: { geometry: string | null } = { geometry: null };

    const pending = scope.settle(() => slow.promise).then((value) => {
      // The only place state is written, and it is gated on the scope.
      if (value === undefined) return;
      applied += 1;
      state.geometry = value.geometry;
    });

    scope.cancel('route-change');
    slow.resolve({ geometry: 'lod0.glb — 2.1 MB of item the buyer is no longer looking at' });
    await pending;

    expect(applied).toBe(0);
    expect(state.geometry).toBeNull();
  });

  it('drops a value that was already resolved when the cancel arrived', async () => {
    const scope = createCancellationScope();
    scope.cancel('unmount');
    const value = await scope.settle(async () => 'geometry');
    expect(value).toBeUndefined();
  });

  it('applies the value when nothing cancelled', async () => {
    const scope = createCancellationScope();
    expect(await scope.settle(async () => 'geometry')).toBe('geometry');
  });

  it('propagates a real failure but swallows an abort', async () => {
    const scope = createCancellationScope();
    await expect(scope.settle(async () => {
      throw new Error('manifest is malformed');
    })).rejects.toThrow(/malformed/);
    expect(await scope.settle(async () => {
      throw new DOMException('cancelled', 'AbortError');
    })).toBeUndefined();
  });

  it('passes the scope’s signal to work that wants it', async () => {
    const scope = createCancellationScope();
    let received: AbortSignal | undefined;
    await scope.settle(async () => {
      received = scope.signal;
      return 1;
    });
    expect(received).toBe(scope.signal);
  });
});

describe('cancelOnRouteChange', () => {
  it('cancels when the route moves', () => {
    const scope: CancellationScope = createCancellationScope();
    const listeners: Array<() => void> = [];
    const unsubscribes: number[] = [];
    const unsubscribe = cancelOnRouteChange(scope, (onChange) => {
      listeners.push(onChange);
      return () => {
        unsubscribes.push(1);
      };
    });

    listeners[0]!();
    expect(scope.cancelled).toBe(true);
    expect(scope.reason).toBe('route-change');
    unsubscribe();
    expect(unsubscribes).toHaveLength(1);
  });

  it('cancels when the subscription itself is torn down', () => {
    const scope = createCancellationScope();
    const unsubscribe = cancelOnRouteChange(scope, () => () => {});
    unsubscribe();
    expect(scope.reason).toBe('route-change');
  });
});
