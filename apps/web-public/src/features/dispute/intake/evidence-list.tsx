/**
 * What the case file actually holds, and what is still in motion.
 *
 * The wording per phase is the whole component. `attached` says "In the case file" because the
 * service said so; `confirming` says the bytes reached us and nothing more, because that is all the
 * transport has established; `interrupted` says which attempt this is rather than showing a spinner
 * that could mean waiting or failing. A buyer who is about to phone us needs the same sentence the
 * audit log will have.
 *
 * Evidence rows carry no thumbnail. A preview means holding a decoded image per attachment in memory
 * on a phone that is also trying to upload three of them, for a screen whose only job is to confirm
 * the file is in the case file — and the filename and byte count already do that.
 */

import { raw, tokens } from '@nastech/design-tokens';
import type { EvidenceDto } from '../api/dispute-transport.js';
import type { UploadState } from './upload-machine.js';
import { formatBytes } from '../limits.js';
import { ActionButton } from '../ui.js';

export type EvidenceTone = 'waiting' | 'moving' | 'held' | 'safe' | 'gone';

export interface PhaseLabel {
  readonly text: string;
  readonly tone: EvidenceTone;
  /** A bar is only honest while the transport is reporting bytes. */
  readonly showProgress: boolean;
}

export function phaseLabel(state: UploadState): PhaseLabel {
  switch (state.phase) {
    case 'queued':
      return { text: 'Waiting for its turn', tone: 'waiting', showProgress: false };
    case 'requesting_slot':
      return { text: 'Asking NasTech for room to send it', tone: 'moving', showProgress: false };
    case 'transferring':
      return {
        text: `Sending — ${formatBytes(state.sentBytes)} of ${formatBytes(state.file.bytes)}`,
        tone: 'moving',
        showProgress: true,
      };
    case 'confirming':
      // The bytes are up. Nothing has yet said they are evidence, and this row must not say it either.
      return { text: 'With NasTech. Waiting for the case file to accept it.', tone: 'held', showProgress: false };
    case 'attached':
      return { text: 'In the case file', tone: 'safe', showProgress: false };
    case 'interrupted':
      return {
        text: `Connection dropped on attempt ${state.attempt}. Trying again — this file has not been counted as sent.`,
        tone: 'waiting',
        showProgress: false,
      };
    case 'rejected':
      return { text: 'Not attached', tone: 'gone', showProgress: false };
    case 'cancelled':
      return { text: 'Cancelled', tone: 'gone', showProgress: false };
    default:
      return { text: 'Unknown', tone: 'waiting', showProgress: false };
  }
}

const TONE_COLOR: Record<EvidenceTone, string> = {
  waiting: raw.color.ink500,
  moving: raw.color.accent600,
  // `held` is deliberately not the positive colour: the case file has not accepted it yet.
  held: raw.color.ink500,
  safe: raw.color.signalPositive,
  gone: raw.color.signalNegative,
};

export interface EvidenceListProps {
  readonly uploads: Readonly<Record<string, UploadState>>;
  /** Evidence the service already holds (a dispute being followed up rather than filed). */
  readonly attached: readonly EvidenceDto[];
  readonly onRetry?: (localId: string) => void;
  readonly onRemove?: (localId: string) => void;
}

export function EvidenceList({ uploads, attached, onRetry, onRemove }: EvidenceListProps) {
  const rows = Object.entries(uploads);
  const serviceIds = new Set(attached.map((e) => e.id));

  return (
    <ul
      id="dp-evidence-list"
      data-testid="dp-evidence-list"
      style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: raw.space.s2 }}
    >
      {attached
        .filter((e) => e.status === 'attached')
        .map((e) => (
          <li
            key={`svc-${e.id}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: raw.space.s3,
              alignItems: 'baseline',
              border: `1px solid ${raw.color.ink100}`,
              borderRadius: raw.radius.md,
              padding: `${raw.space.s2} ${raw.space.s3}`,
              fontFamily: raw.type.familyText,
              fontSize: '0.875rem',
            }}
          >
            <span style={{ color: tokens.text.primary }}>{e.filename}</span>
            <span style={{ color: raw.color.signalPositive, whiteSpace: 'nowrap' }}>
              In the case file · {formatBytes(e.bytes)}
            </span>
          </li>
        ))}

      {rows.map(([localId, state]) => {
        const label = phaseLabel(state);
        const alreadyFromService = state.evidence !== null && serviceIds.has(state.evidence.id);
        const percent = state.file.bytes === 0 ? 0 : Math.min(100, Math.round((state.sentBytes / state.file.bytes) * 100));
        return (
          <li
            key={localId}
            data-phase={state.phase}
            style={{
              display: 'grid',
              gap: raw.space.s1,
              border: `1px solid ${label.tone === 'gone' ? raw.color.signalNegative : raw.color.ink100}`,
              borderRadius: raw.radius.md,
              padding: `${raw.space.s2} ${raw.space.s3}`,
              fontFamily: raw.type.familyText,
              fontSize: '0.875rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: raw.space.s3, alignItems: 'baseline' }}>
              <span style={{ color: tokens.text.primary }}>{state.file.filename}</span>
              <span style={{ color: TONE_COLOR[label.tone], whiteSpace: 'nowrap' }}>{label.text}</span>
            </div>
            {label.showProgress ? (
              <div
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Sending ${state.file.filename}`}
                style={{ height: 3, background: raw.color.ink100, borderRadius: raw.radius.pill, overflow: 'hidden' }}
              >
                <div style={{ width: `${percent}%`, height: '100%', background: raw.color.accent600 }} />
              </div>
            ) : null}
            {state.message !== null ? (
              <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.5, color: tokens.text.secondary }}>{state.message}</p>
            ) : null}
            <div style={{ display: 'flex', gap: raw.space.s2, flexWrap: 'wrap' }}>
              {state.phase === 'rejected' || state.phase === 'interrupted' ? (
                <ActionButton emphasis="quiet" onClick={() => onRetry?.(localId)}>
                  Try sending it again
                </ActionButton>
              ) : null}
              {state.phase !== 'attached' && !alreadyFromService ? (
                <ActionButton emphasis="quiet" onClick={() => onRemove?.(localId)}>
                  Remove
                </ActionButton>
              ) : null}
              {alreadyFromService ? (
                <span style={{ fontSize: '0.8125rem', color: tokens.text.disabled }}>Already in the dispute — removing it here would not take it out of the case file.</span>
              ) : null}
            </div>
          </li>
        );
      })}

      {rows.length === 0 && attached.length === 0 ? (
        <li style={{ fontSize: '0.875rem', color: tokens.text.secondary, fontFamily: raw.type.familyText }}>
          Nothing attached yet. This does not stop you sending the dispute.
        </li>
      ) : null}
    </ul>
  );
}
