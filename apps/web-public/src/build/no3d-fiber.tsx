/** `@react-three/fiber` replacement: no reconciler, no GL, no frame loop. */
import type { ReactNode } from 'react';
export const useFrame = (_cb: (state: unknown, delta: number) => void) => {};
export const useThree = () => ({ gl: null, scene: null, camera: null, invalidate: () => {} });
export function Canvas(_props: { children?: ReactNode }): ReactNode { return null; }
export type RootState = Record<string, never>;
