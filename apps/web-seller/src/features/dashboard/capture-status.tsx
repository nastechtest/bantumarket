import type { CaptureJobState } from '@nastech/api-contracts';
import type { CaptureSnapshot } from './api/dashboard-transport.js';
import { Muted, Panel } from './ui.js';

/** Seller-facing wording for the capture ladder; the ladder itself comes from the contract. */
export const CAPTURE_STATE_LABELS: Readonly<Record<CaptureJobState, string>> = {
  intake: 'Booked in',
  captured: 'Photographed',
  processed: 'Being processed',
  qc_auto: 'Automatic checks',
  qc_human: 'With a reviewer',
  published: 'Ready to show',
  failed: 'Could not be produced',
  reshot: 'Being re-photographed',
};

export const CAPTURE_DONE_STATES: readonly CaptureJobState[] = ['published'];

export function capturePercent(state: CaptureJobState): number {
  const order: readonly CaptureJobState[] = ['intake', 'captured', 'processed', 'qc_auto', 'qc_human', 'published'];
  if (state === 'failed') return 0;
  if (state === 'reshot') return 25;
  const index = order.indexOf(state);
  return index < 0 ? 0 : Math.round(((index + 1) / order.length) * 100);
}

/**
 * Capture enhances a listing; it is never a prerequisite for one. The card therefore never uses
 * language that suggests the listing is incomplete without it.
 */
export function CaptureStatus({ capture }: { capture: CaptureSnapshot | null }) {
  if (capture === null) {
    return (
      <Panel title="3D preview" id="capture-status">
        <Muted>No capture is booked. Your listing works with photographs alone — a capture only adds a 3D view.</Muted>
      </Panel>
    );
  }
  const percent = capturePercent(capture.jobState);
  return (
    <Panel title="3D preview" id="capture-status" actions={<a href={`/listings/${capture.listingId}/capture`}>Open</a>}>
      <div>
        <strong>{capture.listingTitle}</strong>
        <Muted>{CAPTURE_STATE_LABELS[capture.jobState]}</Muted>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`Capture progress: ${CAPTURE_STATE_LABELS[capture.jobState]}`}
        style={{ height: '6px', background: 'var(--ink-100)', borderRadius: '999px' }}
      >
        <div style={{ width: `${percent}%`, height: '100%', background: 'var(--accent)', borderRadius: '999px' }} />
      </div>
      {capture.jobState === 'failed' ? (
        <div role="alert">
          <strong>We could not produce the 3D preview.</strong>
          <Muted>{capture.operatorNote ?? 'Your photographs are unaffected and your listing can stay live.'}</Muted>
        </div>
      ) : null}
      <Muted>A 3D preview shows shape and outer condition only. It does not show how the watch works or whether it is authentic.</Muted>
    </Panel>
  );
}
