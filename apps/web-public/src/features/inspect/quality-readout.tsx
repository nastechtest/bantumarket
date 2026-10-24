import { describeLod, formatLodSummary } from './lod-picker.js';
import { formatMegabytes } from './byte-gate.js';
import { STATIC_REASON_TEXT, type InspectPlan } from './inspect-decision.js';

/**
 * The quality readout: which LOD, how many bytes, which tier, and *why* — shown for both paths.
 *
 * The buyer is owed the same three facts whether they get a scene or the static path, because each
 * one is a claim about what they are looking at: lod2 is a coarser mesh than lod0 and a "balanced"
 * tier is a repaint-rate decision, not a judgement about the item. When the path is static, the
 * one-line reason is the whole point — it names what happened (reduced motion, save-data, a refused
 * budget, no WebGL) instead of letting a missing render look like a missing item.
 */

export interface QualityReadoutProps {
  readonly plan: InspectPlan;
}

export function QualityReadout({ plan }: QualityReadoutProps) {
  if (plan.mode === 'scene') {
    const { lod, bytes } = plan.gate;
    return (
      <p className="nt-quality nt-quality--scene">
        <span className="tier">
          {formatLodSummary(lod)} · {plan.tier.reason}
        </span>
        <span className="nt-quality__detail"> {describeLod(lod)} ({formatMegabytes(bytes)} on the wire).</span>
      </p>
    );
  }

  const reasonText = STATIC_REASON_TEXT[plan.reason];
  const lodLine = plan.gate ? ` ${formatLodSummary(plan.gate.lod)} would be needed — over this ceiling.` : '';
  return (
    <p className="nt-quality nt-quality--static" role="status">
      <span className="tier">{reasonText}</span>
      {lodLine ? <span className="nt-quality__detail">{lodLine}</span> : null}
    </p>
  );
}
