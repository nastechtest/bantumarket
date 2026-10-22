/**
 * Focus trap (07 §4.1 `controls/`).
 *
 * The viewer's controls are a small, deliberate instrument: Tab walks the pose buttons and the zoom
 * buttons and stays there, because leaving the instrument mid-inspection means the buyer is scrolling
 * a page while a watch hangs in the air. But a trap that cannot be escaped is a worse disability than
 * the one it is papering over, and a trap whose edge is a `<canvas>` is worse again — focus lands on a
 * pixel buffer that has nothing to say and the buyer is gone.
 *
 * So: Tab/Shift-Tab cycle the controls, Escape leaves the viewer by moving focus to the next real thing
 * on the page, and canvases are excluded from the ring entirely (and made unfocusable on activate, in
 * case a runtime set `tabindex` on them).
 */

export const FOCUSABLE_SELECTOR =
  'a[href], button, input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export interface FocusTrapOptions {
  /** Where Escape puts focus. Defaults to the next focusable element after the container. */
  readonly escapeTo?: HTMLElement | null;
  /** Called when focus is deliberately handed back to the page. The app uses it to drop its own trap. */
  readonly onLeave?: () => void;
}

export interface FocusTrapHandle {
  activate(): void;
  deactivate(): void;
}

function focusableButNotDetached(root: ParentNode): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  const out: HTMLElement[] = [];
  for (const el of nodes) {
    // A canvas is a pixel buffer, not a control. If it takes focus the ring has a hole in it.
    if (el.tagName === 'CANVAS' || el.hasAttribute('data-3d-detached')) continue;
    if (el.getAttribute('aria-hidden') === 'true') continue;
    if (el.hasAttribute('disabled')) continue;
    out.push(el);
  }
  return out;
}

/** The ring, in document order. Live query, so a pose list that renders late is still trapped. */
export function focusablesIn(container: HTMLElement): HTMLElement[] {
  const inside = focusableButNotDetached(container);
  if (inside.length > 0) return inside;
  // A viewer whose controls render as siblings of the host (an overlay outside the div) still needs a
  // ring, or Escape has nowhere to walk to.
  return container.parentElement ? focusableButNotDetached(container.parentElement) : [];
}

export interface FocusStep {
  readonly target: HTMLElement | null;
  /** True when the step leaves the container, which is the signal to hand focus to the page. */
  readonly leaving: boolean;
}

/**
 * Where Tab should go. Cycling is the trap; the `leaving` flag exists because the caller has to know
 * whether it is moving focus inside the viewer or releasing it, and guessing from the element is how
 * focus ends up in a detached canvas.
 */
export function nextFocusable(items: readonly HTMLElement[], current: HTMLElement | null, shift: boolean): FocusStep {
  if (items.length === 0) return { target: null, leaving: true };
  const index = current ? items.indexOf(current) : -1;
  if (index === -1) return { target: items[shift ? items.length - 1 : 0]!, leaving: false };
  const next = (index + (shift ? -1 : 1) + items.length) % items.length;
  return { target: items[next]!, leaving: false };
}

/**
 * The next focusable thing outside the viewer's own ring, which is where Escape sends the buyer.
 * Document order matters: "after the viewer" is the condition report link, not the search link the
 * buyer already passed. With nothing after it, the first thing before the ring is the honest fallback,
 * because a page always has one — the header.
 */
export function escapeTargetAfter(container: HTMLElement, scope: Document | HTMLElement = document): HTMLElement | null {
  const ring = focusablesIn(container);
  if (ring.length === 0) return null;
  const all = focusableButNotDetached(scope);
  const ringSet = new Set(ring);
  const lastRingIndex = all.reduce((acc, el, index) => (ringSet.has(el) ? index : acc), -1);
  if (lastRingIndex === -1) return all[0] ?? null;
  for (let i = lastRingIndex + 1; i < all.length; i += 1) {
    const candidate = all[i];
    if (candidate && !ringSet.has(candidate)) return candidate;
  }
  const firstRingIndex = all.findIndex((el) => ringSet.has(el));
  for (let i = 0; i < firstRingIndex; i += 1) {
    const candidate = all[i];
    if (candidate) return candidate;
  }
  return null;
}

export function createFocusTrap(container: HTMLElement, options: FocusTrapOptions = {}): FocusTrapHandle {
  const onKeyDown = (event: Event) => {
    const e = event as KeyboardEvent;
    if (e.key === 'Escape') {
      const target = options.escapeTo ?? escapeTargetAfter(container);
      if (target) {
        e.preventDefault();
        target.focus();
      } else {
        // Nothing after the viewer: release to the document body rather than hold the ring shut.
        e.preventDefault();
        container.blur();
        (document.activeElement as HTMLElement | null)?.blur();
      }
      options.onLeave?.();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusablesIn(container);
    if (items.length === 0) return;
    const step = nextFocusable(items, document.activeElement as HTMLElement | null, e.shiftKey);
    if (!step.target) return;
    e.preventDefault();
    step.target.focus();
  };

  return {
    activate() {
      for (const canvas of container.querySelectorAll('canvas')) {
        // Belt and braces: the ring already skips canvases, this stops a runtime from making one a
        // stop in the page's own Tab order.
        canvas.setAttribute('tabindex', '-1');
      }
      container.addEventListener('keydown', onKeyDown);
    },
    deactivate() {
      container.removeEventListener('keydown', onKeyDown);
    },
  };
}
