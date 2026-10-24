import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import { suggest } from './suggest.js';

/**
 * The search field. Mobile-first: 44px hit target, `type="search"` so phones show the right
 * keyboard and the platform clear affordance, and suggestions computed locally (see suggest.ts)
 * — a keystroke must not become a bill, and offline the bar still helps.
 *
 * Keyboard contract: ArrowDown/Up move through the suggestion list with
 * `aria-activedescendant`, Enter picks the highlighted suggestion when there is one, Escape
 * closes the list without touching the query. Submitting navigates; it does not fetch.
 */
export function SearchBar({
  value,
  onSubmit,
}: {
  readonly value: string;
  readonly onSubmit: (query: string) => void;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const baseId = useId();
  const listId = `${baseId}-suggest`;
  const options = open ? suggest(text) : [];

  // External navigation (back/forward, shared link applied) must move the field, but typing
  // while a request is in flight must not be reset by the old value.
  useEffect(() => {
    setText((current) => (current === value ? current : value));
  }, [value]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setOpen(false);
    setActive(-1);
    onSubmit(text.trim());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault();
      setActive((a) => (a + 1) % options.length);
      return;
    }
    if (event.key === 'ArrowUp' && options.length > 0) {
      event.preventDefault();
      setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
      return;
    }
    if (event.key === 'Enter' && active >= 0) {
      const chosen = options[active];
      if (chosen === undefined) return;
      event.preventDefault();
      setText(chosen);
      submit();
    }
  };

  return (
    <form role="search" onSubmit={submit} style={{ position: 'relative', fontFamily: raw.type.familyText }}>
      <div style={{ display: 'flex', gap: raw.space.s2 }}>
        <input
          ref={inputRef}
          type="search"
          name="q"
          value={text}
          placeholder="Search watches, straps, tools…"
          aria-label="Search listings"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          {...(active >= 0 ? { 'aria-activedescendant': `${listId}-${active}` } : {})}
          // onInput, not onChange: React's ChangeEventPlugin (which synthesises onChange for
          // text inputs) does not fire under bun+jsdom — verified while writing these tests.
          // For a live search field the browser semantics are the same event; the tests here
          // are the proof, and a real browser dispatches both.
          onInput={(event) => {
            setText(event.currentTarget.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(text.trim() !== '')}
          onBlur={() => {
            // Give a click on a suggestion one tick to land before the list closes.
            setTimeout(() => setOpen(false), 120);
          }}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 44,
            border: `1px solid ${raw.color.ink300}`,
            borderRadius: raw.radius.md,
            padding: `${raw.space.s2} ${raw.space.s3}`,
            fontSize: '1rem',
            color: tokens.text.primary,
            background: tokens.surface.primary,
            fontFamily: raw.type.familyText,
          }}
        />
        <button
          type="submit"
          style={{
            minHeight: 44,
            minWidth: 64,
            background: tokens.action.default,
            color: tokens.text.onInverse,
            border: 'none',
            borderRadius: raw.radius.md,
            fontSize: '0.9375rem',
            cursor: 'pointer',
            padding: `${raw.space.s2} ${raw.space.s3}`,
          }}
        >
          Search
        </button>
      </div>
      {open && options.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: raw.space.s1,
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 10,
            background: tokens.surface.primary,
            border: `1px solid ${raw.color.ink100}`,
            borderRadius: raw.radius.md,
            boxShadow: '0 8px 24px rgba(11, 13, 16, 0.12)',
          }}
        >
          {options.map((option, index) => (
            <li key={option} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setText(option);
                  submit();
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  minHeight: 44,
                  border: 'none',
                  background: index === active ? tokens.surface.raised : 'transparent',
                  fontSize: '0.9375rem',
                  color: tokens.text.primary,
                  cursor: 'pointer',
                  padding: `0 ${raw.space.s3}`,
                }}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
