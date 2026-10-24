import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import { LAYER } from './layer.js';

export interface MenuItem {
  readonly key: string;
  readonly label: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  /** Marks an irreversible action so the item reads as destructive, not decorative. */
  readonly danger?: boolean;
}

export interface MenuProps {
  triggerLabel: string;
  items: readonly MenuItem[];
  align?: 'start' | 'end';
}

/**
 * Menu button following the WAI-ARIA menu pattern, because the half-implemented version —
 * clickable items, arrow keys dead — is the common failure this package asserts against:
 *  - Trigger carries `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`.
 *  - Opening puts focus on the first enabled item; ArrowDown/ArrowUp/Home/End move between
 *    enabled items only (disabled items are skipped, not tab-stopped); Enter/Space select.
 *  - Escape and Tab close the menu and return focus to the trigger; outside click closes.
 * Typeahead: a printable character focuses the first item whose label starts with it.
 */
export function Menu({ triggerLabel, items, align = 'start' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const firstEnabled = items.findIndex((i) => !i.disabled);
    if (firstEnabled >= 0) itemRefs.current[firstEnabled]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!listRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]); // eslint is not in this repo; the effect only needs to run on open.

  const closeAndReturn = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const focusEnabled = (from: number, direction: 1 | -1): void => {
    if (items.length === 0) return;
    let cursor = from;
    for (let hops = 0; hops < items.length; hops += 1) {
      cursor = (cursor + direction + items.length) % items.length;
      const item = items[cursor];
      if (item && !item.disabled) {
        itemRefs.current[cursor]?.focus();
        return;
      }
    }
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent) => {
    const activeIndex = itemRefs.current.findIndex((el) => el !== null && el === document.activeElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusEnabled(activeIndex < 0 ? -1 : activeIndex, 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusEnabled(activeIndex < 0 ? 0 : activeIndex, -1);
        break;
      case 'Home':
        event.preventDefault(); {
        const first = items.findIndex((i) => !i.disabled);
        if (first >= 0) itemRefs.current[first]?.focus();
        break;
      }
      case 'End':
        event.preventDefault(); {
        const last = items.map((i) => !i.disabled).lastIndexOf(true);
        if (last >= 0) itemRefs.current[last]?.focus();
        break;
      }
      case 'Escape':
        event.preventDefault();
        closeAndReturn();
        break;
      case 'Tab':
        // The menu pattern says Tab dismisses the menu; letting it walk into inert-feeling
        // offscreen content is the trap keyboard users hit on half-built menus.
        event.preventDefault();
        setOpen(false);
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const needle = event.key.toLowerCase();
          const start = activeIndex < 0 ? 0 : activeIndex;
          for (let hops = 0; hops < items.length; hops += 1) {
            const idx = (start + hops) % items.length;
            const item = items[idx];
            if (item && !item.disabled && item.label.toLowerCase().startsWith(needle)) {
              itemRefs.current[idx]?.focus();
              event.preventDefault();
              break;
            }
          }
        }
    }
  };

  return (
    <span className="ds-menu-wrap" style={{ position: 'relative', display: 'inline-block', fontFamily: raw.type.familyText }}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        {...(open ? { 'aria-controls': menuId } : {})}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        style={{
          background: tokens.surface.primary,
          color: tokens.text.primary,
          border: `1px solid ${raw.color.ink300}`,
          borderRadius: raw.radius.sm,
          padding: `${raw.space.s2} ${raw.space.s3}`,
          fontSize: '0.875rem',
          cursor: 'pointer',
        }}
      >
        {triggerLabel}
      </button>
      {open ? (
        <ul
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label={triggerLabel}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          style={{
            position: 'absolute',
            top: '100%',
            left: align === 'start' ? 0 : undefined,
            right: align === 'end' ? 0 : undefined,
            zIndex: LAYER.menu,
            listStyle: 'none',
            margin: 0,
            padding: raw.space.s1,
            minWidth: '12rem',
            background: tokens.surface.primary,
            border: `1px solid ${raw.color.ink100}`,
            borderRadius: raw.radius.md,
          }}
        >
          {items.map((item, index) => (
            <li key={item.key} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled === true}
                tabIndex={-1}
                data-danger={item.danger ? 'true' : undefined}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                onClick={() => {
                  if (item.disabled) return;
                  setOpen(false);
                  item.onSelect();
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  borderRadius: raw.radius.sm,
                  padding: `${raw.space.s2} ${raw.space.s3}`,
                  fontSize: '0.875rem',
                  color: item.danger ? raw.color.signalNegative : tokens.text.primary,
                  cursor: item.disabled ? 'default' : 'pointer',
                  opacity: item.disabled ? 0.5 : 1,
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </span>
  );
}
