import type { Caliper } from './scene-types.js';

/**
 * The measurement panel (rule 2 in the app layer: a size claim is only as good as the capture's
 * metric alignment).
 *
 * It deliberately does NOT invent millimetres. A caliper's real length is measured by
 * `@nastech/ui-3d/overlays`' `MeasurementOverlay` from the loaded mesh and the capture's
 * `metricScaleMetersPerUnit`; this component only says whether that alignment exists, lists the
 * calipers the buyer has been offered, and shows the millimetre values the overlay measured. When the
 * alignment is missing or invalid the panel states "Measurements unavailable" rather than guessing —
 * a fabricated mm is indistinguishable from a real one, and the render is not evidence.
 */

export interface MeasurePanelProps {
  readonly metersPerUnit: number | null | undefined;
  readonly calipers: readonly (Caliper & { millimetres?: number })[];
  readonly onToggleCaliper?: (id: string) => void;
}

/** Invalid/absent alignment removes measurements — it never fakes them. */
export function alignmentValid(metersPerUnit: number | null | undefined): boolean {
  return typeof metersPerUnit === 'number' && Number.isFinite(metersPerUnit) && metersPerUnit > 0;
}

export function formatMillimetres(mm: number): string {
  return `${mm.toFixed(1)} mm`;
}

export function MeasurePanel({ metersPerUnit, calipers, onToggleCaliper }: MeasurePanelProps) {
  if (!alignmentValid(metersPerUnit)) {
    return (
      <p className="nt-measure nt-measure--unavailable" role="note">
        Measurements unavailable — this capture has no metric alignment, so a size cannot be read off the render.
      </p>
    );
  }

  if (calipers.length === 0) {
    return (
      <p className="nt-measure nt-measure--empty" role="note">
        Drag on the model to measure a distance. Sizes come from the capture&apos;s alignment, not an estimate.
      </p>
    );
  }

  return (
    <ul className="nt-measure" aria-label="Measurements taken on the model">
      {calipers.map((caliper) => (
        <li key={caliper.id} className="nt-measure__row">
          <span className="nt-measure__label">{caliper.label}</span>
          <span className="nt-measure__value">
            {typeof caliper.millimetres === 'number' ? formatMillimetres(caliper.millimetres) : '—'}
          </span>
          {onToggleCaliper ? (
            <button type="button" className="secondary" onClick={() => onToggleCaliper(caliper.id)}>
              Hide
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
