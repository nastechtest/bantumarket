import { CLAIM_SCOPE_DISCLOSURE, type ClaimScope, type ConditionCaption } from '@nastech/api-contracts';
import { raw, tokens } from '@nastech/design-tokens';
import { SEVERITY_ORDER, markerCss, severityStyles, type Severity } from './severity-styles.js';
import { isValidMetersPerUnit, SCALE_BAR_METERS } from './scale-bar.js';

/**
 * Legend (brief 03, module 5).
 *
 * Two disciplines, both load-bearing:
 *  · The claim-scope sentence is read out of `CLAIM_SCOPE_DISCLOSURE` — never typed out locally.
 *    A local paraphrase is how the disclosure and the UI drift apart, and the drift is what a
 *    dispute argues about. There is a test that this component's text equals the contract string.
 *  · The legend names only what is actually on screen. A severity that no caption carries is not
 *    listed; measurements are listed as unavailable when the capture has no metric alignment.
 */

export interface LegendProps {
  readonly claimScope: ClaimScope;
  readonly captions: readonly ConditionCaption[];
  readonly metersPerUnit: number | null | undefined;
  readonly showCalipers: boolean;
}

export function Legend({ claimScope, captions, metersPerUnit, showCalipers }: LegendProps) {
  const severitiesPresent = SEVERITY_ORDER.filter((s) => captions.some((c) => c.severity === s));
  const aligned = isValidMetersPerUnit(metersPerUnit);

  return (
    <div
      className="nt-legend"
      role="region"
      aria-label="Overlay legend"
      style={{
        pointerEvents: 'auto',
        padding: raw.space.s3,
        background: tokens.surface.primary,
        color: tokens.text.primary,
        border: `1px solid ${raw.color.ink100}`,
        borderRadius: raw.radius.md,
        font: `400 12px/1.4 ${raw.type.familyText}`,
        maxWidth: 280,
      }}
    >
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: raw.space.s2 }}>
        {severitiesPresent.map((severity: Severity) => (
          <li key={severity} style={{ display: 'flex', alignItems: 'center', gap: raw.space.s2 }}>
            <span aria-hidden style={markerCss(severity)} />
            <span>{severityStyles[severity].label}</span>
          </li>
        ))}
        {severitiesPresent.length === 0 ? (
          <li>No condition markers on this model.</li>
        ) : null}
        {aligned ? (
          <li>{`${(SCALE_BAR_METERS * 1000).toFixed(0)} mm bar — sized from the capture's metric alignment`}</li>
        ) : (
          <li>Measurements unavailable: this capture has no metric alignment.</li>
        )}
        {showCalipers && aligned ? <li>Dashed calipers: distances between two points, in mm.</li> : null}
        <li>Markers are pointers to disclosure records, not evidence themselves.</li>
      </ul>
      <p style={{ margin: 0, marginTop: raw.space.s2, color: tokens.text.secondary }}>{CLAIM_SCOPE_DISCLOSURE[claimScope]}</p>
    </div>
  );
}
