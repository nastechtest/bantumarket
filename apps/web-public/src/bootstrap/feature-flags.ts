/**
 * Feature flags — defaults, an env source, and a hard line.
 *
 * `pay.offlineQueue` exists in the table only so it can be asserted *false* in review and in
 * tests; the shell's offline behaviour does not consult it, because a flag that can silently
 * re-enable payment queueing is the bug, not the feature. The buy control's disabled-with-a-
 * reason path in layout/sticky-buy-bar-slot.tsx is unconditional while offline.
 *
 * Sources, lowest to highest precedence: code defaults → `VITE_FLAGS_JSON` → caller overrides
 * (staff tooling debug panel, later). Unknown keys are ignored; wrong types are ignored. Flags
 * are read once at provider mount — live flipping is a session-layer concern, not chrome.
 */

export const FLAG_DEFAULTS = {
  'chrome.tabBar': true,
  'chrome.breadcrumbs': true,
  'chrome.consentBanner': true,
  'pay.offlineQueue': false,
  'scene.autoOpen': false,
} as const;

export type FlagName = keyof typeof FLAG_DEFAULTS;
export type Flags = Readonly<Record<FlagName, boolean>>;
export type FlagOverrides = Readonly<Partial<Record<FlagName, boolean>>>;

export const defaultFlags: Flags = { ...FLAG_DEFAULTS };

export function resolveFlags(source?: string | null, overrides: FlagOverrides = {}): Flags {
  const flags: Record<FlagName, boolean> = { ...FLAG_DEFAULTS };
  if (source) {
    try {
      const parsed: unknown = JSON.parse(source);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          if (key in flags && typeof value === 'boolean') flags[key as FlagName] = value;
        }
      }
    } catch {
      // malformed JSON: run on defaults rather than refusing to boot. Ops sees this in the
      // flags panel, not in a white screen.
    }
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (key in flags && typeof value === 'boolean') flags[key as FlagName] = value;
  }
  return flags;
}

export function getFlag(flags: Flags, name: FlagName): boolean {
  return flags[name];
}
