/**
 * The clock the service holds.
 *
 * This component has one architectural duty, and it is the reason the brief names it: the remaining
 * time on a dispute must survive the tab being closed. A countdown started at page load tells a buyer
 * who opened the screen on Tuesday and came back on Friday that they still have the same time left,
 * and it inherits the handset's clock as its authority. Both are lies, and the second one is the kind
 * that ends in an argument about a deadline.
 *
 * So: `dueAt` and `asOf` both come from the service read, the arithmetic happens in `../clock.ts`
 * against `asOf`, and there is no timer in this file at all. The copy says which clock it is quoting.
 * A stale reading is shown as stale rather than silently re-counted.
 */

import { raw, tokens } from '@nastech/design-tokens';
import type { SlaDto } from '../api/dispute-transport.js';
import { durationBetween, formatDuration, formatLongDate, formatTimestamp } from '../clock.js';
import { Body, Panel } from '../ui.js';

export type SlaTone = 'running' | 'paused' | 'overdue' | 'stale';

export interface SlaReading {
  readonly tone: SlaTone;
  readonly headline: string;
  readonly detail: string;
  /** Whose move the service thinks it is. Rendered, never inferred from the tone. */
  readonly waitingOn: string | null;
}

/** How far a read may lag the deadline before the screen says "this is an old look at the case"
 *  instead of computing against a stamp the service no longer holds. */
export const STALE_READ_MS = 6 * 60 * 60 * 1000;

function isStale(sla: SlaDto): boolean {
  const asOf = Date.parse(sla.asOf);
  const due = Date.parse(sla.dueAt);
  if (Number.isNaN(asOf) || Number.isNaN(due)) return true;
  return asOf > due + STALE_READ_MS;
}

/**
 * Pure: `sla` in, wording out. Exported for `../sla.test.ts`, which is where the "closing the tab does
 * not buy you time" property is actually proved rather than claimed.
 */
export function slaReading(sla: SlaDto): SlaReading {
  const waitingOn =
    sla.awaiting === undefined
      ? null
      : sla.awaiting === 'service'
        ? 'A reviewer at NasTech'
        : sla.awaiting === 'buyer'
          ? 'You'
          : 'The seller';

  if (isStale(sla)) {
    return {
      tone: 'stale',
      headline: 'This is an old look at the case',
      detail: `The last reading we took was ${formatTimestamp(sla.asOf)}, after the date the service recorded (${formatLongDate(sla.dueAt)}). Reload to get the clock as it stands.`,
      waitingOn,
    };
  }

  if (sla.paused) {
    const remaining = durationBetween(sla.asOf, sla.dueAt);
    return {
      tone: 'paused',
      headline: 'The clock is stopped',
      detail: `${sla.pauseReason ?? 'The service is waiting on an answer.'} It is held at ${formatLongDate(sla.dueAt)}${remaining.past ? '' : ` — ${formatDuration(remaining)} from when this was read`}, and it starts again when the thing it is waiting for arrives.`,
      waitingOn,
    };
  }

  const remaining = durationBetween(sla.asOf, sla.dueAt);
  if (remaining.past) {
    return {
      tone: 'overdue',
      headline: `Past the date the service recorded by ${formatDuration(remaining)}`,
      detail: `The date was ${formatLongDate(sla.dueAt)}, measured on NasTech’s clock as read at ${formatTimestamp(sla.asOf)}. Being past it is not a decision, and it is not a promise that one is coming — it is a reason to ask what happened to it.`,
      waitingOn,
    };
  }

  return {
    tone: 'running',
    headline: `${formatDuration(remaining)} left on the service’s clock`,
    detail: `The date is ${formatLongDate(sla.dueAt)}. This is not counted from when you opened this page: it is counted from ${formatTimestamp(sla.asOf)}, the moment the service answered this read, so closing the tab does not buy or cost you anything.`,
    waitingOn,
  };
}

const TONE_EDGE: Record<SlaTone, string> = {
  running: tokens.action.default,
  paused: raw.color.ink300,
  // Overdue gets the caution colour and not the negative one: a date the service missed is not a fault
  // of the buyer's, and a red band implies somebody did something wrong.
  overdue: raw.color.signalCaution,
  stale: raw.color.ink300,
};

export function SlaClock({ sla }: { sla: SlaDto }) {
  const reading = slaReading(sla);
  return (
    <Panel title="The clock on this case" id="dp-sla" meta={sla.basis}>
      <div style={{ display: 'grid', gap: raw.space.s2 }}>
        <div
          data-testid="dp-sla-reading"
          data-tone={reading.tone}
          style={{
            borderLeft: `3px solid ${TONE_EDGE[reading.tone]}`,
            paddingLeft: raw.space.s3,
          }}
        >
          <p style={{ margin: 0, fontFamily: raw.type.familyText, fontSize: '1rem', fontWeight: 600, color: tokens.text.primary }}>
            {reading.headline}
          </p>
          <p style={{ margin: `${raw.space.s1} 0 0`, fontFamily: raw.type.familyText, fontSize: '0.875rem', lineHeight: 1.55, color: tokens.text.secondary }}>
            {reading.detail}
          </p>
        </div>
        {reading.waitingOn !== null ? (
          <Body size="small">
            The service records the next move as <strong>{reading.waitingOn}</strong>’s. That is its note, not
            our guess.
          </Body>
        ) : null}
      </div>
    </Panel>
  );
}
