/**
 * Operator claims on a job.
 *
 * Two people can walk up to the same item. Without a claim, both shoot it, both seal a manifest, and
 * the second transfer overwrites the first session's custody story. The claim is a lease with an
 * expiry, not a lock forever: a rig left overnight by someone who went home must be usable in the
 * morning, and the history of who held it stays in the file.
 *
 * The lease is intentionally short (30 minutes by default, renewable). A stale claim that blocks a
 * shift is its own outage; an expiry that is silently extended is not a claim at all.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inputInvalid, stationProtocol } from '../errors.js';

export const DEFAULT_CLAIM_MINUTES = 30;
export const MAX_CLAIM_MINUTES = 120;

export interface OperatorClaim {
  readonly jobId: string;
  readonly operator: string;
  readonly claimedAt: string;
  readonly expiresAt: string;
  readonly renewedAt: string | null;
  readonly previousOperator: string | null;
}

interface ClaimsFile {
  readonly version: 1;
  readonly claims: readonly OperatorClaim[];
}

export interface ClaimResult {
  readonly claim: OperatorClaim;
  /** True when the caller took over an expired lease rather than creating or renewing one. */
  readonly tookOverExpired: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class OperatorClaims {
  readonly #file: string;
  #claims: readonly OperatorClaim[];

  private constructor(file: string, claims: readonly OperatorClaim[]) {
    this.#file = file;
    this.#claims = claims;
  }

  static open(dir: string): OperatorClaims {
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'claims.json');
    if (!existsSync(file)) return new OperatorClaims(file, []);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      throw inputInvalid('The operator claims file is not valid JSON.', 'Restore it from the last good copy; claims are operational state, not evidence.');
    }
    if (!isRecord(raw) || raw['version'] !== 1 || !Array.isArray(raw['claims'])) {
      throw inputInvalid('The operator claims file has an unknown shape.', 'Restore it from the last good copy.');
    }
    return new OperatorClaims(file, raw['claims'] as OperatorClaim[]);
  }

  #write(next: readonly OperatorClaim[]): void {
    const temp = `${this.#file}.tmp`;
    writeFileSync(temp, `${JSON.stringify({ version: 1, claims: next }, null, 2)}\n`, 'utf8');
    renameSync(temp, this.#file);
    this.#claims = next;
  }

  claims(): readonly OperatorClaim[] {
    return Object.freeze([...this.#claims]);
  }

  current(jobId: string): OperatorClaim | null {
    return this.#claims.find((claim) => claim.jobId === jobId) ?? null;
  }

  /**
   * Claim, renew, or take over an expired lease. An unexpired claim held by someone else is a
   * refusal with the holder's name in it, because the operator's next move is to go and ask them.
   */
  claim(jobId: string, operator: string, now: Date, ttlMinutes: number = DEFAULT_CLAIM_MINUTES): ClaimResult {
    if (!jobId.trim()) throw inputInvalid('A claim needs a job id.', 'Claims are per job; an item id is not enough when a job can be re-shot.');
    if (!operator.trim()) throw inputInvalid('A claim needs the operator’s name.', 'An anonymous claim cannot be handed over or released.');
    if (!Number.isInteger(ttlMinutes) || ttlMinutes <= 0 || ttlMinutes > MAX_CLAIM_MINUTES) {
      throw inputInvalid(`Claim TTL ${ttlMinutes} minutes is outside 1–${MAX_CLAIM_MINUTES}.`, 'A claim is a shift-length lease, not an ownership record.');
    }
    const existing = this.current(jobId);
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString();

    if (existing) {
      const unexpired = Date.parse(existing.expiresAt) > now.getTime();
      if (unexpired && existing.operator !== operator) {
        throw stationProtocol(
          'Operator claim',
          `job ${jobId} is claimed by ${existing.operator} until ${existing.expiresAt}`,
          'Ask the holder to release it, or wait for the lease to expire. Do not shoot the item in parallel — two manifests for one hand-in is a custody dispute.',
          { jobId, holder: existing.operator, expiresAt: existing.expiresAt },
        );
      }
      if (unexpired) {
        const renewed: OperatorClaim = { ...existing, expiresAt, renewedAt: nowIso };
        this.#write(this.#claims.map((claim) => (claim.jobId === jobId ? renewed : claim)));
        return { claim: renewed, tookOverExpired: false };
      }
      const takeover: OperatorClaim = {
        jobId,
        operator,
        claimedAt: nowIso,
        expiresAt,
        renewedAt: null,
        previousOperator: existing.operator,
      };
      this.#write(this.#claims.map((claim) => (claim.jobId === jobId ? takeover : claim)));
      return { claim: takeover, tookOverExpired: true };
    }

    const claim: OperatorClaim = { jobId, operator, claimedAt: nowIso, expiresAt, renewedAt: null, previousOperator: null };
    this.#write([...this.#claims, claim]);
    return { claim, tookOverExpired: false };
  }

  /** Renewal is a claim by the same name; any other name is refused. */
  renew(jobId: string, operator: string, now: Date, ttlMinutes: number = DEFAULT_CLAIM_MINUTES): OperatorClaim {
    return this.claim(jobId, operator, now, ttlMinutes).claim;
  }

  release(jobId: string, operator: string): OperatorClaim {
    const existing = this.current(jobId);
    if (!existing) throw inputInvalid(`Job ${jobId} is not claimed.`, 'Nothing to release.');
    if (existing.operator !== operator) {
      throw stationProtocol(
        'Operator claim',
        `job ${jobId} is held by ${existing.operator}; ${operator} cannot release it`,
        'Only the holder releases a claim. A supervisor takeover is an expired-lease event, not a silent release.',
      );
    }
    this.#write(this.#claims.filter((claim) => claim.jobId !== jobId));
    return existing;
  }

  active(now: Date): readonly OperatorClaim[] {
    return Object.freeze(this.#claims.filter((claim) => Date.parse(claim.expiresAt) > now.getTime()));
  }

  /** Drop expired leases from the file. Expiry has already made them unusable; this keeps the file readable. */
  sweep(now: Date): readonly OperatorClaim[] {
    const removed = this.#claims.filter((claim) => Date.parse(claim.expiresAt) <= now.getTime());
    if (removed.length > 0) this.#write(this.#claims.filter((claim) => Date.parse(claim.expiresAt) > now.getTime()));
    return Object.freeze(removed);
  }

  assertHeldBy(jobId: string, operator: string, now: Date): OperatorClaim {
    const existing = this.current(jobId);
    if (!existing) {
      throw stationProtocol('Operator claim', `job ${jobId} is not claimed by anyone`, 'Claim the job before shooting it; an unclaimed session has no named operator in custody.');
    }
    if (existing.operator !== operator) {
      throw stationProtocol(
        'Operator claim',
        `job ${jobId} is held by ${existing.operator} until ${existing.expiresAt}`,
        'Take over only after the lease expires, or ask the holder to release it.',
      );
    }
    if (Date.parse(existing.expiresAt) <= now.getTime()) {
      throw stationProtocol('Operator claim', `job ${jobId} lease expired at ${existing.expiresAt}`, 'Renew the claim before continuing the session.');
    }
    return existing;
  }
}
