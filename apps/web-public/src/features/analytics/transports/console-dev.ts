/**
 * Development transport: print what would have been sent, and complain in a language a developer can
 * act on.
 *
 * The second half is the reason this file exists. A production gateway can only drop a bad row
 * silently — dropping someone's data loudly on their phone would be its own kind of bug — so the
 * *only* place a schema or PII mistake can be surfaced as an error is here, before the code ships.
 * `consoleDevTransport` therefore re-runs the PII scan over every batch it prints: if a feature
 * managed to build a row that the tracker let through, a developer sees it in their own console
 * rather than a data subject finding it in an access request.
 */
import { scanProps } from '../pii-guards.js';
import { refPropsOf, type EventName } from '../events.js';
import { MAX_BATCH_BYTES, estimateBatchBytes, type Batch, type EventTransport, type SendResult } from '../transport.js';

export interface ConsoleDevOptions {
  /** Injectable sink so tests capture the output and an app can route it to a debug overlay. */
  readonly log?: (line: string, payload?: unknown) => void;
  readonly prefix?: string;
  /** Default true: a dev transport that prints nothing is indistinguishable from one that was never wired. */
  readonly enabled?: boolean;
}

export interface ConsoleDevTransport extends EventTransport {
  readonly lines: readonly string[];
  readonly warnings: readonly string[];
  readonly batchesSent: number;
}

export function consoleDevTransport(options: ConsoleDevOptions = {}): ConsoleDevTransport {
  const prefix = options.prefix ?? '[analytics]';
  const enabled = options.enabled ?? true;
  const sink =
    options.log ??
    ((line: string, payload?: unknown): void => {
      if (payload === undefined) console.log(line);
      else console.log(line, payload);
    });

  const lines: string[] = [];
  const warnings: string[] = [];
  let batchesSent = 0;

  return {
    id: 'console-dev',
    async send(batch: Batch): Promise<SendResult> {
      batchesSent += 1;
      if (!enabled) return { ok: true, accepted: batch.events.length, via: 'queued' };

      const bytes = estimateBatchBytes(batch);
      const header = `${prefix} flush ${batch.flushReason} · ${batch.events.length} event(s) · ${bytes} B · consent v${batch.consentVersion}`;
      lines.push(header);
      sink(header);

      for (const event of batch.events) {
        const line = `  ${new Date(event.occurredAt).toISOString()}  ${event.category.padEnd(11)} ${event.name}  ${JSON.stringify(event.props)}`;
        lines.push(line);
        sink(line, { envelope: event });

        // Dev-only second opinion. `event.name` is a catalogue key by construction of the queue, and
        // the ref-prop list is what tells the scanner which long random strings are legal.
        const hits = scanProps(event.props as Record<string, unknown>, refPropsOf(event.name as EventName));
        for (const hit of hits) {
          const warning = `${prefix} PII SHAPED VALUE in ${event.name}.${hit.path}: ${hit.kind} — ${hit.why}`;
          warnings.push(warning);
          lines.push(warning);
          sink(warning);
        }
      }

      if (bytes > MAX_BATCH_BYTES) {
        const warning = `${prefix} batch is ${bytes} B, over the ${MAX_BATCH_BYTES} B cap the gateway enforces — it would have been dropped`;
        warnings.push(warning);
        sink(warning);
      }

      return { ok: true, accepted: batch.events.length, via: 'queued' };
    },
    get lines() {
      return lines;
    },
    get warnings() {
      return warnings;
    },
    get batchesSent() {
      return batchesSent;
    },
  };
}
