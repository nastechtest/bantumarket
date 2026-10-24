import { installDom } from './env.js';
import { fire } from './events.js';

/**
 * Pointer-gesture sequences for the touch controls.
 *
 * `packages/ui-3d/src/controls/pinch-zoom.ts` and `gesture-state.ts` are driven by TWO simultaneous
 * pointers, and jsdom gives you neither `PointerEvent` (see `dom/env.ts`, which synthesises the class)
 * nor a reason for two events to share a stream. Hand-rolling this per package is where the bug lives:
 * a fake that omits `pointerId` makes every two-finger test look like a one-finger test, so pinch code
 * "passes" while production does not rotate.
 *
 * This keeps a session: pointer ids are tracked, `isPrimary` is set only on the first, and coordinates
 * arrive as `clientX/clientY` plus `pageX/pageY`, because different components in this repo read
 * different pairs.
 */

export interface PointerPoint {
  readonly x: number;
  readonly y: number;
  readonly pointerId?: number;
  readonly pointerType?: 'touch' | 'mouse' | 'pen';
}

export interface PointerSession {
  /** Next pointer id handed out; 1 so a single-finger test reads like a browser's primary pointer. */
  nextId(): number;
  down(target: Element, point: PointerPoint): number;
  move(target: Element, point: PointerPoint & { pointerId: number }): void;
  up(target: Element, point: PointerPoint & { pointerId: number }): void;
  cancel(target: Element, point: PointerPoint & { pointerId: number }): void;
  /** Active pointer ids, which is how a test asserts a gesture really is two-finger. */
  active(): readonly number[];
  /** One-finger drag in `steps` moves; end points are the final position, not an interpolated one. */
  drag(target: Element, from: PointerPoint, to: PointerPoint, steps?: number): number;
  /** Two-finger pinch: `distance` in pixels, from `startDistance` to `endDistance`, in `steps`. */
  pinch(target: Element, centre: PointerPoint, startDistance: number, endDistance: number, steps?: number): { readonly pointerIds: readonly [number, number] };
  /** Release everything still down, so an aborted gesture cannot leak into the next test. */
  releaseAll(target: Element): void;
}

export function createPointerSession(): PointerSession {
  let idCounter = 1;
  const active = new Map<number, PointerPoint>();
  const targets = new Map<number, Element>();

  function send(target: Element, type: string, point: PointerPoint & { pointerId: number }): void {
    const primary = active.size <= 1 || point.pointerId === 1;
    fire(target, type, {
      pointerId: point.pointerId,
      pointerType: point.pointerType ?? 'touch',
      isPrimary: primary,
      clientX: point.x,
      clientY: point.y,
      pageX: point.x,
      pageY: point.y,
      bubbles: true,
      cancelable: true,
    });
  }

  function down(target: Element, point: PointerPoint): number {
    const pointerId = point.pointerId ?? idCounter++;
    active.set(pointerId, point);
    targets.set(pointerId, target);
    send(target, 'pointerdown', { ...point, pointerId });
    fire(target, 'mousedown', { clientX: point.x, clientY: point.y });
    return pointerId;
  }

  function move(target: Element, point: PointerPoint & { pointerId: number }): void {
    if (!active.has(point.pointerId)) {
      throw new Error(
        `[testing/pointer] pointermove for id ${point.pointerId} with no pointerdown. ` +
          'A real browser does not deliver moves for an unclaimed pointer, and components that key off ' +
          'gesture-start would accept this fake one.',
      );
    }
    active.set(point.pointerId, point);
    send(target, 'pointermove', point);
    fire(target, 'mousemove', { clientX: point.x, clientY: point.y });
  }

  function up(target: Element, point: PointerPoint & { pointerId: number }): void {
    send(target, 'pointerup', point);
    fire(target, 'mouseup', { clientX: point.x, clientY: point.y });
    fire(target, 'click', { clientX: point.x, clientY: point.y });
    active.delete(point.pointerId);
    targets.delete(point.pointerId);
  }

  function cancel(target: Element, point: PointerPoint & { pointerId: number }): void {
    send(target, 'pointercancel', point);
    active.delete(point.pointerId);
    targets.delete(point.pointerId);
  }

  function drag(target: Element, from: PointerPoint, to: PointerPoint, steps = 4): number {
    const pointerId = down(target, from);
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      move(target, { pointerId, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    }
    up(target, { pointerId, x: to.x, y: to.y });
    return pointerId;
  }

  function pinch(
    target: Element,
    centre: PointerPoint,
    startDistance: number,
    endDistance: number,
    steps = 5,
  ): { readonly pointerIds: readonly [number, number] } {
    const half = (d: number) => d / 2;
    const firstId = idCounter++;
    const secondId = idCounter++;
    const startA: PointerPoint & { pointerId: number } = { ...centre, pointerId: firstId, x: centre.x - half(startDistance) };
    const startB: PointerPoint & { pointerId: number } = { ...centre, pointerId: secondId, x: centre.x + half(startDistance) };
    down(target, startA);
    down(target, startB);
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const distance = startDistance + (endDistance - startDistance) * t;
      move(target, { ...startA, x: centre.x - half(distance) });
      move(target, { ...startB, x: centre.x + half(distance) });
    }
    up(target, { ...startA, x: centre.x - half(endDistance) });
    up(target, { ...startB, x: centre.x + half(endDistance) });
    return { pointerIds: [firstId, secondId] };
  }

  function releaseAll(target: Element): void {
    for (const [pointerId, point] of [...active.entries()]) {
      up(targets.get(pointerId) ?? target, { ...point, pointerId });
    }
    active.clear();
    targets.clear();
  }

  return {
    nextId: () => idCounter++,
    down,
    move,
    up,
    cancel,
    active: () => [...active.keys()],
    drag,
    pinch,
    releaseAll,
  };
}

/** jsdom has no pointer capture; the viewer's drag code calls it, so provide the real shape. */
export function installPointerCapture(): void {
  const { window } = installDom();
  const prototype = window.Element.prototype as unknown as {
    setPointerCapture?: (id: number) => void;
    releasePointerCapture?: (id: number) => void;
    hasPointerCapture?: (id: number) => boolean;
  };
  if (typeof prototype.setPointerCapture === 'function') return;
  const captured = new WeakMap<Element, Set<number>>();
  prototype.setPointerCapture = function (this: Element, pointerId: number) {
    const set = captured.get(this) ?? new Set<number>();
    set.add(pointerId);
    captured.set(this, set);
  };
  prototype.releasePointerCapture = function (this: Element, pointerId: number) {
    captured.get(this)?.delete(pointerId);
  };
  prototype.hasPointerCapture = function (this: Element, pointerId: number) {
    return captured.get(this)?.has(pointerId) === true;
  };
}

/** A session with capture available, which is what a viewer gesture test wants by default. */
export function createGesture(): PointerSession {
  installPointerCapture();
  return createPointerSession();
}
