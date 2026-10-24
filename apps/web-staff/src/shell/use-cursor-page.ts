import { useCallback, useEffect, useRef, useState } from 'react';
import { getOnline, subscribeOnline } from './connectivity.js';
import type { CursorPage } from './cursor.js';

export type CursorStatus = 'loading' | 'ready' | 'error' | 'offline';

export interface CursorPageState<T> {
  readonly status: CursorStatus;
  readonly rows: readonly T[];
  readonly nextCursor: string | null;
  readonly canPrevious: boolean;
  readonly scanned: number;
  readonly error: string | null;
  readonly busy: boolean;
  readonly reload: () => void;
  readonly next: () => void;
  readonly previous: () => void;
}

export type CursorFetcher<T> = (cursor: string | null) => Promise<CursorPage<T>>;

/**
 * Cursor paging with a bounded page size. The hook never asks for "all rows", keeps a stack of
 * visited cursors so Previous is a real request rather than an offset guess, and refuses to
 * fetch while the browser reports itself offline.
 */
export function useCursorPage<T>(fetcher: CursorFetcher<T>, options: { readonly auto?: boolean } = {}): CursorPageState<T> {
  const [rows, setRows] = useState<readonly T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<CursorStatus>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<readonly (string | null)[]>([null]);
  const [position, setPosition] = useState(0);
  const [scanned, setScanned] = useState(0);
  const [tick, setTick] = useState(0);
  const requestId = useRef(0);
  const hasRows = useRef(false);
  const online = useOnline();

  const load = useCallback(
    async (cursor: string | null) => {
      const id = requestId.current + 1;
      requestId.current = id;
      if (!online) {
        setStatus(hasRows.current ? 'ready' : 'offline');
        setError(null);
        return;
      }
      setBusy(true);
      setError(null);
      if (!hasRows.current) setStatus('loading');
      try {
        const page = await fetcher(cursor);
        if (requestId.current !== id) return;
        hasRows.current = page.rows.length > 0;
        setRows(page.rows);
        setNextCursor(page.nextCursor);
        setScanned(page.scanned);
        setStatus('ready');
      } catch (caught) {
        if (requestId.current !== id) return;
        setError(caught instanceof Error ? caught.message : 'The request failed.');
        setStatus(hasRows.current ? 'ready' : 'error');
      } finally {
        if (requestId.current === id) setBusy(false);
      }
    },
    [fetcher, online],
  );

  useEffect(() => {
    void load(cursorStack[position] ?? null);
  }, [load, cursorStack, position, tick]);

  const reload = useCallback(() => {
    hasRows.current = false;
    setCursorStack([null]);
    setPosition(0);
    setRows([]);
    setStatus('loading');
    setTick((value) => value + 1);
  }, []);

  const next = useCallback(() => {
    if (nextCursor === null) return;
    setCursorStack((stack) => {
      const trimmed = stack.slice(0, position + 1);
      return [...trimmed, nextCursor];
    });
    setPosition((value) => value + 1);
  }, [nextCursor, position]);

  const previous = useCallback(() => {
    if (position === 0) return;
    setPosition((value) => Math.max(0, value - 1));
  }, [position]);

  return {
    status,
    rows,
    nextCursor,
    canPrevious: position > 0,
    scanned,
    error,
    busy,
    reload,
    next,
    previous,
  };
}

function useOnline(): boolean {
  const [online, setLocal] = useState(getOnline());
  useEffect(() => subscribeOnline(() => setLocal(getOnline())), []);
  return online;
}
