/**
 * Body scroll lock for overlays, the iOS-safe variant proven in the committed `sheet.tsx`:
 * `overflow: hidden` alone still lets iOS bounce and then re-render document flow at the top,
 * so the body is pinned with `position: fixed; top: -scrollY` and the saved offset is restored
 * by scrolling back on unlock. Headless so modal, drawer and sheet-side overlays share one
 * implementation; `sheet.tsx` keeps its inlined copy because it is committed and frozen.
 */
export function lockBodyScroll(): () => void {
  const body = document.body;
  const savedScrollY = window.scrollY;
  const previous = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    width: body.style.width,
    overflow: body.style.overflow,
  };
  body.style.position = 'fixed';
  body.style.top = `-${savedScrollY}px`;
  body.style.left = '0';
  body.style.width = '100%';
  body.style.overflow = 'hidden';

  let unlocked = false;
  return () => {
    if (unlocked) return;
    unlocked = true;
    body.style.position = previous.position;
    body.style.top = previous.top;
    body.style.left = previous.left;
    body.style.width = previous.width;
    body.style.overflow = previous.overflow;
    window.scrollTo(0, savedScrollY);
  };
}
