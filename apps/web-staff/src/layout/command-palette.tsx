import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { NavItem } from '../nav/nav-model.js';

/**
 * A palette, not a modal. Tab is deliberately not intercepted: the console's rule is that focus is
 * never trapped, so Escape and the visible Close button are the ways out and a keyboard user can
 * always tab back to the page. The item list is the *already filtered* nav model, so a destination
 * the session cannot see cannot be summoned by typing its name.
 */
export function CommandPalette({ items, onClose }: { items: readonly NavItem[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const linkRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const inputId = useId();

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => {
      previous?.focus();
    };
  }, []);

  const needle = query.trim().toLowerCase();
  const matches =
    needle === ''
      ? items
      : items.filter(
          (item) => item.label.toLowerCase().includes(needle) || item.path.toLowerCase().includes(needle),
        );

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      linkRefs.current[0]?.focus();
    }
  }

  function onLinkKeyDown(event: KeyboardEvent<HTMLAnchorElement>, index: number): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      linkRefs.current[index + 1]?.focus();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (index === 0) inputRef.current?.focus();
      else linkRefs.current[index - 1]?.focus();
    }
  }

  return (
    <div
      className="ops-palette-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="ops-palette"
        role="dialog"
        aria-label="Command palette"
        data-testid="command-palette"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <div className="ops-palette-head">
          <label htmlFor={inputId}>Go to section</label>
          <button type="button" className="ops-link-button" onClick={onClose}>
            Close
          </button>
        </div>
        <input
          id={inputId}
          ref={inputRef}
          className="ops-palette-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onInputKeyDown}
          autoComplete="off"
        />
        {matches.length === 0 ? (
          <p className="ops-palette-empty" role="status">
            {items.length === 0
              ? 'No sections are available for this account.'
              : `No section matches “${query.trim()}”.`}
          </p>
        ) : (
          <ul className="ops-palette-list">
            {matches.map((item, index) => (
              <li key={item.path}>
                <a
                  href={item.path}
                  ref={(element) => {
                    linkRefs.current[index] = element;
                  }}
                  onClick={onClose}
                  onKeyDown={(event) => onLinkKeyDown(event, index)}
                >
                  <span>{item.label}</span>
                  <code>{item.path}</code>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
