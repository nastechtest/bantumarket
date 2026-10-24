/**
 * Save-for-later. The store is injected so behaviour is testable without a browser: production
 * passes `localStorage` (wrapped — private-mode Safari throws on *write*, and a throw there must
 * not break the buy button sitting next to it), tests pass a Map.
 *
 * Persistence is best-effort and says so: the button toggles optimistically; when the write fails
 * the data attribute records it and the label stays honest.
 */

import { useCallback, useState } from 'react';
import { raw, tokens } from '@nastech/design-tokens';

/** The minimal synchronous key/value shape; `localStorage` fits, a Map-backed fake fits. */
export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SAVED_LISTINGS_KEY = 'nastech:saved-listings';

export function readSaved(store: Store): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(store.getItem(SAVED_LISTINGS_KEY) ?? '[]');
    return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export function toggleSaved(store: Store, listingId: string): { readonly saved: boolean; readonly storeFailed: boolean } {
  const saved = readSaved(store);
  const next = new Set(saved);
  if (next.has(listingId)) next.delete(listingId);
  else next.add(listingId);
  let storeFailed = false;
  try {
    store.setItem(SAVED_LISTINGS_KEY, JSON.stringify([...next]));
  } catch {
    storeFailed = true;
  }
  return { saved: next.has(listingId), storeFailed };
}

const browserStore: Store = {
  getItem: (k) => (typeof window !== 'undefined' && 'localStorage' in window ? window.localStorage.getItem(k) : null),
  setItem: (k, v) => {
    if (typeof window !== 'undefined' && 'localStorage' in window) window.localStorage.setItem(k, v);
  },
};

export interface SaveListingToggleProps {
  readonly listingId: string;
  readonly store?: Store;
}

export function SaveListingToggle({ listingId, store = browserStore }: SaveListingToggleProps) {
  const [state, setState] = useState(() => ({ saved: readSaved(store).has(listingId), storeFailed: false }));
  const onClick = useCallback(() => {
    setState(toggleSaved(store, listingId));
  }, [store, listingId]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={state.saved}
      data-persisted={String(!state.storeFailed)}
      style={{
        background: state.saved ? tokens.surface.raised : 'transparent',
        border: `1px solid ${raw.color.ink100}`,
        borderRadius: raw.radius.md,
        padding: `${raw.space.s1} ${raw.space.s3}`,
        color: tokens.text.primary,
        fontFamily: raw.type.familyText,
        fontSize: '0.8125rem',
        cursor: 'pointer',
      }}
    >
      {state.saved ? 'Saved' : 'Save for later'}
      {state.storeFailed ? <span style={{ color: tokens.text.disabled }}> (this device)</span> : null}
    </button>
  );
}
