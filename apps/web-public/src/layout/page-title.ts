import { useEffect } from 'react';

/**
 * Document titles. The suffix is part of the brand contract (`index.html` ships it), and a
 * route that forgets it makes the browser tab — the buyer's back button list — ambiguous.
 * Null label means "the page owns its title; do not touch it" (a checkout showing the item
 * name is better than "Checkout · NasTech Market").
 */

export const BRAND_TITLE = 'NasTech Market';

export function composeTitle(routeLabel: string | null): string | null {
  if (routeLabel === null) return null;
  if (routeLabel === 'Home') return `${BRAND_TITLE} — second-hand, inspected`;
  return `${routeLabel} · ${BRAND_TITLE}`;
}

/** Testable core: takes the document so pre-render/unit contexts never touch a real DOM. */
export function applyDocumentTitle(doc: { title: string } | null, routeLabel: string | null): void {
  const title = composeTitle(routeLabel);
  if (doc === null || title === null) return;
  doc.title = title;
}

export function usePageTitle(routeLabel: string | null): void {
  useEffect(() => {
    applyDocumentTitle(typeof document === 'undefined' ? null : document, routeLabel);
  }, [routeLabel]);
}
