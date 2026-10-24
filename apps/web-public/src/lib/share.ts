import { copyText } from './clipboard.js';
import type { ClipboardDeps, CopyResult } from './clipboard.js';

/**
 * Share an item. Web Share API where it exists (it is near-universal on Android, which is most
 * of the pilot's traffic), clipboard fallback where it doesn't — and, like clipboard.ts, a
 * result the caller must render honestly. "Shared" is never reported for a failed share; a
 * dismissed picker (AbortError) is success-shaped to the user, so we return `cancelled` and
 * leave it to the caller to say nothing.
 */

export interface SharePayload {
  readonly title: string;
  readonly text?: string;
  readonly url: string;
}

export interface ShareApi {
  (data: SharePayload): Promise<void>;
  readonly supported: boolean;
}

export interface ShareDeps {
  share?: ShareApi | null;
  clipboard?: ClipboardDeps;
}

export type ShareOutcome =
  | { ok: true; via: 'native' }
  // detail is narrowed to the copy's success branch because that is the only way this outcome is
  // ever built — a caller reading `detail.via` should not have to re-derive it from `ok`.
  | { ok: true; via: 'clipboard'; detail: Extract<CopyResult, { ok: true }> }
  | { ok: false; reason: 'cancelled' | 'clipboard-unavailable' };

export function browserShareApi(): ShareApi | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string; url?: string }) => Promise<void> };
  if (typeof nav.share !== 'function') return null;
  const share = nav.share.bind(nav);
  return Object.assign(
    async (data: SharePayload): Promise<void> => {
      // `text` is omitted, not sent as undefined: navigator.share's ShareData has no undefined-valued
      // members, and an absent field is what "no description" means to the picker.
      await share({ title: data.title, ...(data.text !== undefined ? { text: data.text } : {}), url: data.url });
    },
    { supported: true },
  );
}

export async function shareItem(payload: SharePayload, deps: ShareDeps = {}): Promise<ShareOutcome> {
  let share = deps.share;
  if (share === undefined) share = browserShareApi();

  if (share && share.supported) {
    try {
      await share(payload);
      return { ok: true, via: 'native' };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return { ok: false, reason: 'cancelled' };
      // fall through to clipboard: unsupported payload (no url handler) is common on desktop Chrome
    }
  }

  const detail = await copyText(`${payload.title} — ${payload.url}`, deps.clipboard ?? {});
  if (detail.ok) return { ok: true, via: 'clipboard', detail };
  return { ok: false, reason: 'clipboard-unavailable' };
}
