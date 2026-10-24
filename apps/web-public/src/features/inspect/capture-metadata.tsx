import type { AssetManifest } from '@nastech/api-contracts';
import { alignmentValid } from './measure-panel.js';

/**
 * Capture metadata, stated plainly beside the render.
 *
 * The scene route shows *provenance* — which version of the asset this is, the checksum the ledger
 * will later cross-check, and whether the capture carried a metric alignment. It is here so a render
 * never presents itself as more trustworthy than the record behind it (rule 2): the numbers a buyer
 * can compare are the ones that were captured, not ones a view added.
 *
 * The `isPlaceholder` line is the honest label required by the brief: until a real capture ships, the
 * geometry on screen is an authored stand-in and must never read as the item.
 */

export interface CaptureMetadataProps {
  readonly manifest: AssetManifest;
  readonly isPlaceholder: boolean;
}

export function CaptureMetadata({ manifest, isPlaceholder }: CaptureMetadataProps) {
  return (
    <dl className="nt-capture-meta">
      <div>
        <dt>Asset</dt>
        <dd>
          <code>{manifest.assetId}</code> · version {manifest.version}
        </dd>
      </div>
      <div>
        <dt>Capture checksum</dt>
        <dd>
          <code>{manifest.checksum}</code>
        </dd>
      </div>
      <div>
        <dt>Metric alignment</dt>
        <dd>{alignmentValid(manifest.metricScaleMetersPerUnit) ? `${manifest.metricScaleMetersPerUnit} m per unit` : 'Not aligned'}</dd>
      </div>
      {isPlaceholder ? (
        <div className="nt-capture-meta__placeholder">
          <dt>Note</dt>
          <dd>
            This is an authored placeholder that proves the capture pipeline — it is <strong>not the item</strong>. The photographs
            and the written condition notes are the record.
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
