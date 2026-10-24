import type { CSSProperties } from 'react';

/**
 * The classic clipped 1px pattern, kept here so the motion primitives share one definition.
 * `display:none` would remove the label from the accessibility tree; clipping does not.
 */
export const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
};

/** Compose class names without dragging in a dependency. Falsy parts are dropped. */
export function classes(...parts: ReadonlyArray<string | false | undefined>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join(' ');
}
