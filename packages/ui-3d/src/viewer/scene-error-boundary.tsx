import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Scene error boundary (07 §4.1 `viewer/`).
 *
 * A throw during scene construction renders the COMPLETE static path — poster, turntable,
 * written disclosures — never an error message. The buyer does not care why the render died and
 * has no reason to see our stack trace; the static path was declared sufficient, so this
 * component's entire job is to get to it without a flash of apology.
 *
 * `sceneActive` scopes what the boundary is allowed to catch: it owns errors from the scene
 * subtree while the scene is mounted. Once the host has swapped to static content, late throws
 * from inside this subtree are no longer scene errors — they are app bugs — and re-throwing from
 * componentDidCatch escalates them to the outer boundary instead of swallowing them.
 */

export interface SceneErrorBoundaryProps {
  /** The complete static path. Rendered verbatim on a caught scene error. */
  readonly fallback: ReactNode;
  readonly children: ReactNode;
  /** True while the children are the live scene; false once static content occupies the subtree. */
  readonly sceneActive: boolean;
  readonly onSceneError?: (error: Error, info: ErrorInfo) => void;
}

interface SceneErrorBoundaryState {
  failed: boolean;
}

export class SceneErrorBoundary extends Component<SceneErrorBoundaryProps, SceneErrorBoundaryState> {
  override state: SceneErrorBoundaryState = { failed: false };

  // No `override` here: getDerivedStateFromError lives on ComponentSpec, not the class body.
  static getDerivedStateFromError(): SceneErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (!this.props.sceneActive) {
      // Not ours. Re-throw so React hands it to the ancestor boundary / global handler.
      throw error;
    }
    this.props.onSceneError?.(error, info);
  }

  override render(): ReactNode {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

/** Reset so a route change can try a fresh scene without a full remount of the host. */
export function sceneBoundaryKeyFor(assetId: string, version: number): string {
  return `${assetId}@${version}`;
}
