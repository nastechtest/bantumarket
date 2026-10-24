import { useEffect, useState } from 'react';

/**
 * A body-level container for one overlay instance. Per-overlay (not one shared root) because the
 * focus trap inerts every body child outside the open panel: overlays stacked in a single shared
 * container would each be "inside" the others' host and none would go inert. React's portal
 * removes the children on unmount; the effect below removes the host itself.
 */
export function useOverlayContainer(): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);

  if (host === null && typeof document !== 'undefined') {
    const el = document.createElement('div');
    el.setAttribute('data-ds-overlay-host', '');
    // Scheduled, not during render: creating a DOM node in the render phase makes the host
    // invisible to the passive-effect ordering that the trap relies on.
    setHost(el);
  }

  useEffect(() => {
    if (!host) return;
    document.body.appendChild(host);
    return () => {
      if (host.parentElement === document.body) document.body.removeChild(host);
    };
  }, [host]);

  return host;
}
