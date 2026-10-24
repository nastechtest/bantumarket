/**
 * The focus contract every overlay shares, written as headless DOM (no React) so it can be
 * tested against a synthetic document directly — the sheet already proved the behaviours; this
 * factors them out instead of re-implementing them per component.
 *
 * Four obligations, all asserted in tests:
 *  1. Tab/Shift+Tab cycle only among focusables inside the panel; with none, focus stays put.
 *  2. Escape routes to `onEscape` — never a silent swallow.
 *  3. The background is inert: every `body` child outside the panel gets `inert` +
 *     `aria-hidden` while the trap is on, and has both removed on deactivate.
 *  4. Deactivation returns focus to the element that had it when the trap was activated
 *     (the opener), only if that element is still in the document.
 */

export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface FocusTrapOptions {
  onEscape?: () => void;
  /** Overrides the panel as the initial focus target (e.g. a confirm button). */
  initialFocus?: HTMLElement;
}

export interface FocusTrapHandle {
  deactivate(): void;
}

export function activateFocusTrap(panel: HTMLElement, options: FocusTrapOptions = {}): FocusTrapHandle {
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const inerted: HTMLElement[] = [];

  for (const node of Array.from(document.body.children)) {
    if (node === panel || node.contains(panel)) continue;
    if (node instanceof HTMLElement) {
      node.setAttribute('inert', '');
      node.setAttribute('aria-hidden', 'true');
      inerted.push(node);
    }
  }

  const target = options.initialFocus ?? panel;
  target.focus();

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      options.onEscape?.();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusables.length === 0) {
      // A trap with no controls must not let Tab walk into the inerted background either.
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || active === panel || !panel.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !panel.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener('keydown', onKeyDown);

  let deactivated = false;
  return {
    deactivate() {
      if (deactivated) return;
      deactivated = true;
      document.removeEventListener('keydown', onKeyDown);
      for (const node of inerted) {
        node.removeAttribute('inert');
        node.removeAttribute('aria-hidden');
      }
      if (
        previouslyFocused &&
        typeof previouslyFocused.focus === 'function' &&
        document.contains(previouslyFocused)
      ) {
        previouslyFocused.focus();
      }
    },
  };
}
