import { Component, type ErrorInfo, type ReactNode } from 'react';
import { SCENE_FAILURE_COPY } from '../nav/route-policy.js';

/**
 * A scene is an enhancement inside a route, not the route. When the capture preview throws or
 * its lazy chunk fails, this boundary replaces only the canvas slot; the page header, photos and
 * written condition record beside it stay mounted. The copy says the static path is enough.
 */

interface Props {
  readonly children: ReactNode;
  readonly fallbackCopy?: string;
  readonly onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  readonly failed: boolean;
}

export class SceneBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  reset = (): void => {
    this.setState({ failed: false });
  };

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="nt-scene-fallback" role="status">
        <p className="nt-scene-fallback__copy">{this.props.fallbackCopy ?? SCENE_FAILURE_COPY}</p>
        <button type="button" className="nt-button nt-button--secondary" onClick={this.reset}>
          Try the preview again
        </button>
      </div>
    );
  }
}
