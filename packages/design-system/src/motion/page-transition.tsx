import type { ReactNode } from 'react';
import { animationCss, motionOk } from '@nastech/motion';
import { classes } from './styles.js';

/**
 * Route content wrapper. It never defers paint: children render on the first commit and the
 * entering class only softens the cut with a short opacity/offset pass. Under reduced motion
 * the class is absent and the content is simply there.
 */
export const motionPageCss = animationCss('page-enter');

export interface PageTransitionProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  const animate = motionOk('transition');

  return (
    <>
      <style data-ds-motion="page-css" dangerouslySetInnerHTML={{ __html: motionPageCss }} />
      <div
        data-ds-motion="page-transition"
        data-animating={animate ? 'true' : 'false'}
        className={classes('ds-page-transition', animate ? 'motion-page-enter' : undefined, className)}
      >
        {children}
      </div>
    </>
  );
}
