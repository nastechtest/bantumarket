import { durations, easing, motionOk } from '@nastech/motion';

/**
 * The only entrance choreography overlays are allowed to use. Two rules encoded here:
 *  - It is gated by `motionOk('transition')`: under reduced motion the property is absent and
 *    the surface appears at its final state immediately — nothing is hidden, only flourish.
 *  - It animates opacity and a small offset only. An overlay state change is never signalled
 *    by motion alone; the DOM node exists from the first paint, so a screen reader or a
 *    screenshot taken mid-frame loses nothing.
 */
export const overlayAnimCss = `
@keyframes ds-overlay-fade-in{from{opacity:0}to{opacity:1}}
@keyframes ds-panel-rise-in{from{opacity:0;transform:translateY(0.5rem)}to{opacity:1;transform:none}}
@keyframes ds-panel-side-in{from{opacity:0;transform:translateX(1rem)}to{opacity:1;transform:none}}
`;

/** Returns the `animation` style value, or undefined when motion is not allowed. */
export function entranceAnimation(
  name: 'ds-overlay-fade-in' | 'ds-panel-rise-in' | 'ds-panel-side-in',
): string | undefined {
  if (!motionOk('transition')) return undefined;
  return `${name} ${durations.standard}ms ${easing.out}`;
}
