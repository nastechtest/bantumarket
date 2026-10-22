import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { budgets, type AssetManifest } from '@nastech/api-contracts';
import {
  budgetVerdictFor,
  canFetchScene,
  devicePixelRatioCap,
  selectLod,
  type BudgetVerdict,
  type Capability,
  type LodDecision,
} from '@nastech/ui-3d/quality';
import { CanvasHost } from './canvas-host.js';
import { SceneErrorBoundary } from './scene-error-boundary.js';
import { VisibilityGate, frameloopForVisibility } from './visibility-gate.js';
import { DisposalProvider, createDisposalRegistry } from './disposal-registry.js';
import { FrameGovernor, useGovernorLoop } from './frame-governor.js';
import { createContextLossTracker } from './context-loss.js';
import { governorFrameBudgetMs, levelFor, type CanvasCssSize, type RenderLevel } from './render-budget.js';
import type { TelemetryCollector } from './use-3d-telemetry.js';

/**
 * The composed scene host (07 §4.1 `viewer/`).
 *
 * Manifest in → LOD chosen → byte budget checked → CanvasHost + governor + error boundary +
 * visibility gate wired. The static path is a PROP, not a sibling: the host either shows the scene
 * or shows the buyer's static content, never both, and every exit from the scene (no capability,
 * over budget, build error, context loss) lands on the same complete static path. That is rule 1
 * as a component contract.
 */

export type ScenePlanReason = 'ok' | 'capability' | 'over-budget' | 'no-model-rendition';

export interface ScenePlan {
  readonly mode: 'scene' | 'static';
  readonly reason: ScenePlanReason;
  readonly lod: LodDecision | null;
  readonly budget: BudgetVerdict | null;
  readonly level: RenderLevel;
}

export interface ScenePlanInput {
  readonly manifest: AssetManifest;
  readonly capability: Capability;
  readonly budgetBytes?: number;
  readonly canvasSize?: CanvasCssSize;
}

/** Pure so the whole entry decision is testable with no DOM and no GL context. */
export function planScene(input: ScenePlanInput): ScenePlan {
  const { manifest, capability } = input;
  const level: RenderLevel = input.canvasSize ? levelFor(capability, input.canvasSize) : 'high';

  if (!canFetchScene(capability)) {
    return { mode: 'static', reason: 'capability', lod: null, budget: null, level: 'static' };
  }

  const lod = selectLod(manifest, input.budgetBytes ?? budgets.sceneLodMaxBytes);
  const budget = budgetVerdictFor(lod);
  if (!budget.ok) {
    return { mode: 'static', reason: 'over-budget', lod, budget, level };
  }
  if (lod.reason === 'no-rendition') {
    return { mode: 'static', reason: 'no-model-rendition', lod, budget, level };
  }
  return { mode: 'scene', reason: 'ok', lod, budget, level };
}

function GovernorDriver({ governor, baseDpr }: { governor: FrameGovernor; baseDpr: number }) {
  useGovernorLoop(governor, baseDpr);
  return null;
}

export interface SceneHostProps {
  readonly manifest: AssetManifest;
  readonly capability: Capability;
  /** The COMPLETE static path (poster + turntable + written disclosures). Rendered verbatim on
   *  any scene exit — never alongside the scene, never replaced by an error message. */
  readonly staticPath: ReactNode;
  /** Scene content (model subtree, controls) — only ever rendered in scene mode. Omit to let the
   *  host show the rig over an empty graph until a scene body is ready. */
  readonly children?: ReactNode;
  readonly ariaLabel: string;
  readonly budgetBytes?: number;
  readonly canvasSize?: CanvasCssSize;
  readonly telemetry?: TelemetryCollector;
  readonly onContextLost?: (info: { reason: string }) => void;
}

export function SceneHost({
  manifest,
  capability,
  staticPath,
  children,
  ariaLabel,
  budgetBytes,
  canvasSize,
  telemetry,
  onContextLost,
}: SceneHostProps) {
  const plan = useMemo(
    () => planScene({ manifest, capability, ...(budgetBytes !== undefined ? { budgetBytes } : {}), ...(canvasSize !== undefined ? { canvasSize } : {}) }),
    [manifest, capability, budgetBytes, canvasSize],
  );
  const registry = useMemo(createDisposalRegistry, []);
  const tracker = useMemo(() => createContextLossTracker(), []);
  const [lost, setLost] = useState(false);
  const baseDpr = useMemo(() => devicePixelRatioCap(capability), [capability]);

  const governor = useMemo(
    () =>
      new FrameGovernor({
        now: () => performance.now(),
        frameBudgetMs: governorFrameBudgetMs(plan.level),
        ...(telemetry ? { onLevelChange: (level: Parameters<TelemetryCollector['setGovernorLevel']>[0]) => telemetry.setGovernorLevel(level) } : {}),
      }),
    [plan.level, telemetry],
  );

  useEffect(() => {
    if (telemetry && plan.lod) telemetry.setLodTier(plan.lod.tier);
  }, [telemetry, plan.lod]);

  // The host owns the registry's lifetime; children dispose themselves first (React unmounts
  // children before parents), so disposeAll only catches what a child registered late.
  useEffect(() => {
    const current = registry;
    return () => current.disposeAll();
  }, [registry]);

  useEffect(() => {
    if (lost) telemetry?.markContextLost();
  }, [lost, telemetry]);

  if (plan.mode === 'static' || lost) {
    return <>{staticPath}</>;
  }

  return (
    <SceneErrorBoundary
      sceneActive
      fallback={staticPath}
      onSceneError={() => {
        /* telemetry hook; the fallback IS the user-facing response */
      }}
    >
      <DisposalProvider registry={registry}>
        <VisibilityGate>
          {(visible) => (
            <CanvasHost
              dprCap={baseDpr}
              frameloop={frameloopForVisibility(visible)}
              ariaLabel={ariaLabel}
              onReady={() => {
                tracker.start();
                telemetry?.mark('scene-ready');
              }}
              onContextLost={(info) => {
                tracker.lose(info.reason);
                setLost(true);
                onContextLost?.(info);
              }}
            >
              <GovernorDriver governor={governor} baseDpr={baseDpr} />
              {children}
            </CanvasHost>
          )}
        </VisibilityGate>
      </DisposalProvider>
    </SceneErrorBoundary>
  );
}
