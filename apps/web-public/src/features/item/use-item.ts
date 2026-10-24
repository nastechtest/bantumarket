/**
 * Data loading for the item page.
 *
 * The load result is a union with four arms, and `not_found` is separate from `failed` for the
 * same reason search keeps "no matches" apart from "index down" (see @nastech/api-client
 * catalogue.ts): to a buyer they look like one sad screen; to the pilot they mean opposite things,
 * and a UI that collapses them teaches staff nothing.
 *
 * `reload` exists because a sold-or-pulled listing can reappear (seller edits the price); the buy
 * bar and the error view both offer it, and the cancellation flag below makes double-reload safe.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ItemDetail, ItemTransport } from './api/item-transport.js';
import { ItemRequestError } from './api/item-transport.js';

export type ItemLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly detail: ItemDetail }
  | { readonly status: 'failed'; readonly error: ItemRequestError };

export interface UseItemResult {
  readonly load: ItemLoad;
  readonly reload: () => void;
}

export function useItem(transport: ItemTransport, listingId: string): UseItemResult {
  const [nonce, setNonce] = useState(0);
  const [load, setLoad] = useState<ItemLoad>({ status: 'loading' });
  // Per-effect generation token: a superseded fetch (id changed, reload tapped twice) must not be
  // able to write state after the newer one — the classic stale-detail bug where you see the
  // previous watch's price under the new watch's photo.
  const generation = useRef(0);

  const reload = useCallback(() => {
    setLoad({ status: 'loading' });
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const gen = ++generation.current;
    setLoad({ status: 'loading' });
    transport
      .getDetail(listingId)
      .then((detail) => {
        if (gen === generation.current) setLoad({ status: 'ready', detail });
      })
      .catch((error: unknown) => {
        if (gen !== generation.current) return;
        setLoad({ status: 'failed', error: error instanceof ItemRequestError ? error : new ItemRequestError('server') });
      });
    return () => {
      generation.current += 1;
    };
  }, [transport, listingId, nonce]);

  return { load, reload };
}
