/**
 * The single z-index scale for every design-system overlay.
 *
 * CONTRACT-GAP: `@nastech/design-tokens` (frozen for this wave) carries no z-axis, so the scale
 * lives here — the one file allowed to name stacking levels. Every other file imports `LAYER`.
 * `overlay: 40` is chosen to equal the committed `sheet.tsx` root so there is exactly one plane
 * for veil-and-panel overlays; a modal and a sheet never fight for paint order.
 */
export const LAYER = {
  /** Sticky chrome that sits above document flow but below every overlay. */
  sticky: 10,
  /** Consent/compliance banners: above content, out-asked by anything modal. */
  banner: 20,
  /** Veil + panel of dialogs, drawers and sheets. */
  overlay: 40,
  /** Dropdowns and menus opened from within an overlay must clear the overlay panel. */
  menu: 50,
  /** Toasts announce after the fact and must be visible over every overlay. */
  toast: 60,
} as const;

export type LayerName = keyof typeof LAYER;
