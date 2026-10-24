/**
 * The file picker. A `<input type="file">` and nothing else — no camera surface, no WebGL, no
 * capture affordance, because this is a `critical` route and a buyer with no WebGL at all must still
 * be able to file evidence.
 *
 * The picker hands the bytes to the upload machine and then goes quiet: this component renders no
 * status of its own, because status is whatever the service last said (`./evidence-list.tsx` reads the
 * machine's states). Two small decisions keep that honest:
 *   - the input is cleared after every pick, so picking the same file twice re-runs a failed upload
 *     instead of doing nothing and looking like a frozen screen;
 *   - `capture` is never set. Forcing a camera on a buyer who photographed the fault yesterday on a
 *     laptop is how evidence never arrives.
 */

import { useId } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import type { UploadFile } from './upload-machine.js';
import type { EvidenceCandidate } from '../limits.js';
import { ACCEPTED_EVIDENCE_MIMES, EVIDENCE_LIMITS, remainingFileSlots, formatBytes } from '../limits.js';
import { ActionButton, Body, Panel } from '../ui.js';

export function evidenceCandidateOf(file: File): EvidenceCandidate {
  return { filename: file.name, mime: file.type, bytes: file.size };
}

/**
 * The only place bytes leave a `File` and enter the machine. `read` is a closure over the File rather
 * than the bytes themselves: keeping the buffer alive in React state would hold several megabytes per
 * attachment for the life of the tab, and a retry that arrives after the browser let go of the file
 * must fail loudly (see `retryUpload` in `../use-dispute.ts`) instead of re-sending something else.
 */
export function uploadInputFromFile(file: File, localId: string): UploadFile {
  return {
    localId,
    name: file.name,
    mime: file.type,
    bytes: file.size,
    read: async () => new Uint8Array(await file.arrayBuffer()),
  };
}

export interface EvidenceUploadProps {
  readonly onPick: (files: readonly UploadFile[]) => void;
  readonly attachedCount: number;
  readonly disabled?: boolean;
  /** Where the degrade path leads: the statement box, which is always available. */
  readonly onDegrade: () => void;
}

let pickCounter = 0;

export function EvidenceUpload({ onPick, attachedCount, disabled = false, onDegrade }: EvidenceUploadProps) {
  const id = useId();
  const slots = remainingFileSlots(attachedCount);
  const full = slots === 0;

  return (
    <Panel
      title="Photographs or a video of the problem"
      id="dp-evidence"
      meta={`${EVIDENCE_LIMITS.maxFilesPerDispute} files, up to ${formatBytes(EVIDENCE_LIMITS.maxBytesPerFile)} each. ${slots} ${slots === 1 ? 'slot' : 'slots'} left.`}
    >
      <div style={{ display: 'grid', gap: raw.space.s3 }}>
        <div style={{ display: 'grid', gap: raw.space.s2 }}>
          <label htmlFor={id} style={{ fontFamily: raw.type.familyText, fontSize: '0.875rem', fontWeight: 600 }}>
            Choose files from this device
          </label>
          <input
            id={id}
            type="file"
            multiple
            accept={ACCEPTED_EVIDENCE_MIMES.join(',')}
            disabled={disabled || full}
            onChange={(event) => {
              const target = event.target;
              const picked = Array.from(target.files ?? []);
              // Clear before handing over: a retry of the same filename must be a real second pick.
              target.value = '';
              if (picked.length === 0) return;
              const inputs = picked.map((file) => {
                pickCounter += 1;
                return uploadInputFromFile(file, `pick_${pickCounter}`);
              });
              onPick(inputs);
            }}
            style={{
              fontFamily: raw.type.familyText,
              fontSize: '0.875rem',
              color: tokens.text.primary,
              padding: raw.space.s2,
              border: `1px dashed ${raw.color.ink300}`,
              borderRadius: raw.radius.md,
              background: tokens.surface.raised,
              width: '100%',
            }}
          />
          {full ? (
            <Body size="small">
              The case file holds {EVIDENCE_LIMITS.maxFilesPerDispute} files. Remove one below to add another.
            </Body>
          ) : null}
        </div>

        <div
          style={{
            borderTop: `1px solid ${raw.color.ink100}`,
            paddingTop: raw.space.s3,
            display: 'grid',
            gap: raw.space.s2,
          }}
        >
          <Body size="small">
            No photo, no camera, or a file that will not go? That does not stop your dispute. Write what
            you can see in your statement — a reviewer reads the words, and the words are what the case
            file keeps.
          </Body>
          <ActionButton emphasis="quiet" onClick={onDegrade}>
            Skip the photos and write it instead
          </ActionButton>
        </div>
      </div>
    </Panel>
  );
}
