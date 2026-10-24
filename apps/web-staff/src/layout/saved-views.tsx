import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import type { PreferenceStorage } from '../lib/table-prefs.js';
import { browserStorage } from '../lib/table-prefs.js';

export interface SavedView {
  readonly id: string;
  readonly name: string;
  readonly href: string;
}

const STORAGE_KEY = 'nastech.staff.saved-views.v1';
const MAX_VIEWS_PER_TABLE = 8;
const MAX_NAME_LENGTH = 40;

function viewKey(staffId: string, tableId: string): string {
  return `${staffId}::${tableId}`;
}

/**
 * A saved view stores a querystring-driven href, so the only thing that has to be safe is the href.
 * Absolute and protocol-relative URLs are refused: a saved "view" that leaves the console is a
 * phishing surface, and no legitimate table filter needs one.
 */
export function isSafeViewHref(href: string): boolean {
  if (!href.startsWith('/')) return false;
  if (href.startsWith('//')) return false;
  if (href.includes('\\')) return false;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toView(value: unknown): SavedView | null {
  if (!isRecord(value)) return null;
  const { id, name, href } = value;
  if (typeof id !== 'string' || id === '') return null;
  if (typeof name !== 'string' || name.trim() === '') return null;
  if (typeof href !== 'string' || !isSafeViewHref(href)) return null;
  return { id, name: name.slice(0, MAX_NAME_LENGTH), href };
}

function readAll(storage: PreferenceStorage | null): Record<string, SavedView[]> {
  if (storage === null) return {};
  let parsed: unknown;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecord(parsed)) return {};
  const out: Record<string, SavedView[]> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!Array.isArray(value)) continue;
    const views = value.map(toView).filter((view): view is SavedView => view !== null);
    if (views.length > 0) out[key] = views;
  }
  return out;
}

function writeAll(all: Record<string, SavedView[]>, storage: PreferenceStorage | null): void {
  if (storage === null) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage is a convenience; a full quota must not break the table it decorates.
  }
}

export function listViews(
  staffId: string,
  tableId: string,
  storage: PreferenceStorage | null = browserStorage(),
): readonly SavedView[] {
  return readAll(storage)[viewKey(staffId, tableId)] ?? [];
}

export function saveView(
  staffId: string,
  tableId: string,
  name: string,
  href: string,
  storage: PreferenceStorage | null = browserStorage(),
): readonly SavedView[] {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (trimmed === '' || !isSafeViewHref(href)) return listViews(staffId, tableId, storage);
  const all = readAll(storage);
  const key = viewKey(staffId, tableId);
  const existing = all[key] ?? [];
  const duplicate = existing.find((view) => view.name.toLowerCase() === trimmed.toLowerCase());
  const next = duplicate === undefined
    ? [...existing, { id: `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, name: trimmed, href }]
    : existing.map((view) => (view === duplicate ? { ...view, name: trimmed, href } : view));
  const kept = next.slice(-MAX_VIEWS_PER_TABLE);
  all[key] = kept;
  writeAll(all, storage);
  return kept;
}

export function deleteView(
  staffId: string,
  tableId: string,
  id: string,
  storage: PreferenceStorage | null = browserStorage(),
): readonly SavedView[] {
  const all = readAll(storage);
  const key = viewKey(staffId, tableId);
  const remaining = (all[key] ?? []).filter((view) => view.id !== id);
  all[key] = remaining;
  writeAll(all, storage);
  return remaining;
}

export interface SavedViewsProps {
  readonly staffId: string;
  readonly tableId: string;
  /** The filter/sort state of the current page, e.g. `/disputes?state=open&sort=age`. */
  readonly currentHref: string;
  readonly storage?: PreferenceStorage | null;
}

/**
 * Table views are links, not opaque blobs: what an operator saves is the URL they were looking at,
 * so a view can be pasted into a handover note and still resolve. Saving is per staff member —
 * a shared desk must not inherit a colleague's filter and mistake it for the whole queue.
 */
export function SavedViews({ staffId, tableId, currentHref, storage }: SavedViewsProps) {
  const store = storage === undefined ? browserStorage() : storage;
  const [views, setViews] = useState<readonly SavedView[]>(() => listViews(staffId, tableId, store));
  const [name, setName] = useState('');
  const inputId = useId();
  const canSave = name.trim() !== '' && isSafeViewHref(currentHref);

  function onSave(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canSave) return;
    setViews(saveView(staffId, tableId, name, currentHref, store));
    setName('');
  }

  return (
    <section className="ops-saved-views" aria-label={`Saved views for ${tableId}`}>
      {views.length === 0 ? (
        <p className="ops-saved-views-empty">No saved views for this table.</p>
      ) : (
        <ul className="ops-saved-views-list">
          {views.map((view) => (
            <li key={view.id}>
              <a href={view.href}>{view.name}</a>
              <button
                type="button"
                className="ops-link-button"
                aria-label={`Delete saved view ${view.name}`}
                onClick={() => setViews(deleteView(staffId, tableId, view.id, store))}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="ops-saved-views-form" onSubmit={onSave}>
        <label htmlFor={inputId}>Save this view</label>
        <input
          id={inputId}
          value={name}
          maxLength={MAX_NAME_LENGTH}
          placeholder="Name this filter"
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="ops-button" disabled={!canSave}>
          Save view
        </button>
        {isSafeViewHref(currentHref) ? null : (
          <p role="note" className="ops-note">
            This page cannot be saved as a view.
          </p>
        )}
      </form>
    </section>
  );
}
