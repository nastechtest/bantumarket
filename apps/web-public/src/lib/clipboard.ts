/**
 * Copy-to-clipboard with a truthful result.
 *
 * `navigator.clipboard.writeText` fails in real South African conditions — http (not https)
 * on a feature-phone browser, permissions policy, focus requirements — and a UI that resolved
 * silently would claim "copied" while copying nothing. So every path returns a discriminated
 * result and the caller renders the truth. The legacy `execCommand` fallback is injected, not
 * probed, because probing document selection state on import is exactly the module side effect
 * this bundle cannot afford.
 */

export interface ClipboardWriteApi {
  writeText(text: string): Promise<void>;
}

export type LegacyCopy = (text: string) => boolean;

export interface ClipboardDeps {
  clipboard?: ClipboardWriteApi | null;
  legacyCopy?: LegacyCopy | null;
}

export type CopyResult =
  | { ok: true; via: 'clipboard-api' | 'legacy' }
  | { ok: false; reason: 'no-clipboard-api' | 'blocked-by-browser' };

function domLegacyCopy(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.left = '-200%';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(area);
  return ok;
}

export async function copyText(text: string, deps: ClipboardDeps = {}): Promise<CopyResult> {
  const api =
    deps.clipboard !== undefined
      ? deps.clipboard
      : typeof navigator !== 'undefined' && navigator.clipboard
        ? (navigator.clipboard as ClipboardWriteApi)
        : null;

  if (api) {
    try {
      await api.writeText(text);
      return { ok: true, via: 'clipboard-api' };
    } catch {
      // Permission denied or insecure context: fall through to legacy, then report honestly.
    }
  }

  const legacy = deps.legacyCopy !== undefined ? deps.legacyCopy : domLegacyCopy;
  if (legacy && legacy(text)) return { ok: true, via: 'legacy' };

  return { ok: false, reason: api || deps.legacyCopy ? 'blocked-by-browser' : 'no-clipboard-api' };
}
