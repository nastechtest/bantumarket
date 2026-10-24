/**
 * The sealed frame manifest.
 *
 * This is the station's affidavit: 120 filenames, their digests, the angle each was shot at, the
 * focus and luma readings taken at the moment of capture, and the profile and calibration the
 * capture was licensed by. It is sealed once, at the end of the session, and every later step
 * compares against it. A frame that arrives at the origin with a different digest is not "the same
 * frame re-encoded" — it is a different photograph, and the manifest is how that is noticed.
 *
 * Ordering is part of the seal. The digest covers angle order, so re-sorting the manifest to match
 * a transfer that completed out of order invalidates it rather than hiding the reorder.
 */

import { createHash } from 'node:crypto';
import { frameManifestInvalid, inputInvalid } from '../errors.js';
import { canonicalJson, FRAMES_PER_SESSION } from './protocol.js';

const HEX64 = /^[0-9a-f]{64}$/;

export interface FrameRecord {
  /** 1-based frame number, in revolution order. */
  readonly index: number;
  readonly filename: string;
  readonly sha256: string;
  readonly bytes: number;
  /** Nominal angle for this frame, in degrees. */
  readonly angleDegrees: number;
  readonly focusScore: number;
  readonly meanLuma: number;
}

export interface FrameManifestInput {
  readonly stationId: string;
  readonly jobId: string;
  readonly sessionId: string;
  readonly profileFingerprint: string;
  readonly calibrationDigest: string;
  readonly frames: readonly FrameRecord[];
  readonly sealedAt: string;
  readonly expectedFrames?: number;
}

export interface FrameManifest {
  readonly stationId: string;
  readonly jobId: string;
  readonly sessionId: string;
  readonly profileFingerprint: string;
  readonly calibrationDigest: string;
  readonly frameCount: number;
  readonly stepDegrees: number;
  readonly frames: readonly FrameRecord[];
  readonly sealedAt: string;
  readonly digest: string;
}

export function sealFrameManifest(input: FrameManifestInput): FrameManifest {
  const expected = input.expectedFrames ?? FRAMES_PER_SESSION;
  if (!Number.isInteger(expected) || expected < 12) {
    throw inputInvalid(`expectedFrames ${expected} is below the 12-frame static-path floor.`, 'A session shorter than twelve frames is not a turntable.');
  }
  if (input.frames.length !== expected) {
    throw frameManifestInvalid(
      'frame count',
      `${input.frames.length} frames sealed for a ${expected}-frame revolution`,
      { sealed: input.frames.length, expected },
    );
  }
  for (const [name, value] of [
    ['station', input.stationId],
    ['job', input.jobId],
    ['session', input.sessionId],
  ] as const) {
    if (!value.trim()) throw inputInvalid(`Frame manifest needs a ${name} id.`, 'A manifest that cannot be tied to a job and a station is not evidence.');
  }
  for (const [name, value] of [
    ['profile fingerprint', input.profileFingerprint],
    ['calibration digest', input.calibrationDigest],
  ] as const) {
    if (!HEX64.test(value)) throw inputInvalid(`Frame manifest ${name} is not a sha256 digest.`, 'The manifest cites the profile and calibration by digest; a label cannot be forged.');
  }
  if (!Number.isFinite(Date.parse(input.sealedAt))) throw inputInvalid(`sealedAt ${input.sealedAt} is not an instant.`, 'Sealing is a dated event.');

  const step = 360 / expected;
  const filenames = new Set<string>();
  const frames = input.frames
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((frame) => {
      if (!Number.isInteger(frame.index) || frame.index < 1 || frame.index > expected) {
        throw frameManifestInvalid('index', `${frame.index} is outside 1..${expected}`);
      }
      if (filenames.has(frame.filename)) throw frameManifestInvalid('filename', `"${frame.filename}" appears twice`, { filename: frame.filename });
      filenames.add(frame.filename);
      if (!HEX64.test(frame.sha256)) throw frameManifestInvalid('digest', `frame ${frame.index} has "${frame.sha256}"`, { index: frame.index });
      if (!Number.isInteger(frame.bytes) || frame.bytes <= 0) {
        throw frameManifestInvalid('size', `frame ${frame.index} is ${frame.bytes} bytes`, { index: frame.index });
      }
      const nominal = (frame.index - 1) * step;
      if (!Number.isFinite(frame.angleDegrees) || Math.abs(frame.angleDegrees - nominal) > 0.01) {
        throw frameManifestInvalid(
          'angle',
          `frame ${frame.index} is tagged ${frame.angleDegrees}°, the revolution puts it at ${nominal.toFixed(3)}°`,
          { index: frame.index, angle: frame.angleDegrees, nominal },
        );
      }
      for (const [metric, value] of [
        ['focus', frame.focusScore],
        ['luma', frame.meanLuma],
      ] as const) {
        if (!Number.isFinite(value) || value < 0 || value > 1) {
          throw frameManifestInvalid(metric, `frame ${frame.index} reads ${value}`, { index: frame.index });
        }
      }
      return Object.freeze({ ...frame, angleDegrees: Number(nominal.toFixed(6)) });
    });

  // Sorting is not enough: a manifest missing frame 7 and carrying 121 is caught above, but one
  // where index 7 is duplicated as index 8 would otherwise pass a length check.
  const indices = frames.map((f) => f.index);
  if (indices.some((value, position) => value !== position + 1)) {
    throw frameManifestInvalid('sequence', 'frame indices are not exactly 1..N', { indices: indices.slice(0, 10) });
  }

  const core = {
    stationId: input.stationId.trim(),
    jobId: input.jobId.trim(),
    sessionId: input.sessionId.trim(),
    profileFingerprint: input.profileFingerprint,
    calibrationDigest: input.calibrationDigest,
    frameCount: frames.length,
    stepDegrees: Number(step.toFixed(9)),
    frames,
    sealedAt: input.sealedAt,
  };
  const digest = createHash('sha256').update(canonicalJson(core), 'utf8').digest('hex');
  return Object.freeze({ ...core, frames: Object.freeze(frames), digest });
}

/** Recompute the seal. Used by every consumer before trusting any field in the manifest. */
export function verifyFrameManifest(manifest: FrameManifest): boolean {
  const { digest, ...core } = manifest;
  const recomputed = createHash('sha256').update(canonicalJson(core), 'utf8').digest('hex');
  return recomputed === digest;
}

export function assertSealedManifest(manifest: FrameManifest): void {
  if (!verifyFrameManifest(manifest)) {
    throw frameManifestInvalid(
      'seal',
      `manifest ${manifest.sessionId} does not hash to its own digest`,
      { declared: manifest.digest },
    );
  }
}

export interface StoredFrame {
  readonly filename: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface ReconcileResult {
  readonly ok: boolean;
  readonly missing: readonly string[];
  readonly mismatched: readonly string[];
  readonly extra: readonly string[];
  readonly bytes: number;
}

/**
 * Compare what the origin actually stored with the sealed manifest. `extra` is reported rather than
 * fatal: a stray thumbnail in the upload directory is not a reason to lose a good capture, but it is
 * a reason to say so.
 */
export function reconcileFrameManifest(manifest: FrameManifest, stored: readonly StoredFrame[]): ReconcileResult {
  const byName = new Map(stored.map((frame) => [frame.filename, frame]));
  const missing: string[] = [];
  const mismatched: string[] = [];
  let bytes = 0;
  for (const frame of manifest.frames) {
    const found = byName.get(frame.filename);
    if (!found) {
      missing.push(frame.filename);
      continue;
    }
    bytes += found.bytes;
    if (found.sha256 !== frame.sha256 || found.bytes !== frame.bytes) {
      mismatched.push(frame.filename);
    }
  }
  const expectedNames = new Set(manifest.frames.map((frame) => frame.filename));
  const extra = stored.filter((frame) => !expectedNames.has(frame.filename)).map((frame) => frame.filename);
  return {
    ok: missing.length === 0 && mismatched.length === 0,
    missing: Object.freeze(missing),
    mismatched: Object.freeze(mismatched),
    extra: Object.freeze(extra),
    bytes,
  };
}

export function assertFramesReconciled(manifest: FrameManifest, result: ReconcileResult): void {
  if (result.ok) return;
  throw frameManifestInvalid(
    'transfer reconciliation',
    `session ${manifest.sessionId}: ${result.missing.length} missing, ${result.mismatched.length} changed`,
    { missing: result.missing.slice(0, 12), mismatched: result.mismatched.slice(0, 12) },
  );
}

/** The names the origin should hold, for a transfer plan that starts from the seal. */
export function manifestFilenames(manifest: FrameManifest): readonly string[] {
  return Object.freeze(manifest.frames.map((frame) => frame.filename));
}
