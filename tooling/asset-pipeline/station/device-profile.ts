/**
 * The rig's declared optical configuration.
 *
 * The profile is not a settings screen — it is the set of numbers every measurement is
 * downstream of. A sensor width typed as 36 mm when the body is APS-C turns a 40 mm case into a
 * 60 mm one, and nothing later in the pipeline can tell. So the profile is sealed at commissioning
 * with a fingerprint, the handshake names the fingerprint, and a station whose profile changed
 * without a new commissioning is refused rather than silently re-scaled.
 */

import { createHash } from 'node:crypto';
import { canonicalJson } from './protocol.js';
import { inputInvalid } from '../errors.js';
import { PROTOCOL_VERSION } from './protocol.js';

export type SensorFormat = 'full_frame' | 'aps_c' | 'mft' | 'one_inch';

const SENSOR_WIDTH_MM: Readonly<Record<SensorFormat, number>> = {
  full_frame: 36,
  aps_c: 23.5,
  mft: 17.3,
  one_inch: 13.2,
};

export interface DeviceProfile {
  readonly profileId: string;
  readonly stationId: string;
  readonly cameraModel: string;
  readonly lensModel: string;
  readonly sensorFormat: SensorFormat;
  /** Published sensor width. Kept explicit so a profile cannot be built from a format alone. */
  readonly sensorWidthMm: number;
  readonly focalLengthMm: number;
  readonly captureWidthPx: number;
  readonly captureHeightPx: number;
  readonly turntableSteps: number;
  readonly firmware: string;
  readonly commissionedAt: string;
  readonly protocolVersion: number;
}

export interface DeviceProfileInput {
  readonly profileId: string;
  readonly stationId: string;
  readonly cameraModel: string;
  readonly lensModel: string;
  readonly sensorFormat: SensorFormat;
  readonly sensorWidthMm: number;
  readonly focalLengthMm: number;
  readonly captureWidthPx: number;
  readonly captureHeightPx: number;
  readonly turntableSteps: number;
  readonly firmware: string;
  readonly commissionedAt: string;
}

export interface ProfileRequirement {
  readonly minCaptureWidthPx: number;
  readonly minTurntableSteps: number;
  readonly focalLengthRangeMm: readonly [number, number];
  readonly allowedSensorFormats: readonly SensorFormat[];
}

/**
 * What the watch programme needs: enough pixels on a 40 mm case to resolve a scratch, a lens long
 * enough that perspective does not make the lugs look longer than they are, and a full revolution.
 */
export const WATCH_CAPTURE_REQUIREMENT: ProfileRequirement = {
  minCaptureWidthPx: 4000,
  minTurntableSteps: 120,
  focalLengthRangeMm: [50, 105],
  allowedSensorFormats: ['full_frame', 'aps_c'],
};

export function defineDeviceProfile(input: DeviceProfileInput): DeviceProfile {
  const positive = (name: string, value: number): number => {
    if (!Number.isFinite(value) || value <= 0) {
      throw inputInvalid(`Device profile ${name} is ${value}.`, 'Optical dimensions must be positive, finite numbers.');
    }
    return value;
  };
  for (const [name, value] of [
    ['profileId', input.profileId],
    ['stationId', input.stationId],
    ['cameraModel', input.cameraModel],
    ['lensModel', input.lensModel],
    ['firmware', input.firmware],
  ] as const) {
    if (!value.trim()) throw inputInvalid(`Device profile needs a ${name}.`, 'An unnamed rig cannot be matched to a calibration record.');
  }
  if (!(input.sensorFormat in SENSOR_WIDTH_MM)) {
    throw inputInvalid(`"${input.sensorFormat}" is not a sensor format this pipeline knows.`, `Use one of ${Object.keys(SENSOR_WIDTH_MM).join(', ')}.`);
  }
  const published = SENSOR_WIDTH_MM[input.sensorFormat];
  const declared = positive('sensorWidthMm', input.sensorWidthMm);
  // Ten microns of slack covers the difference between a manufacturer's marketing number and the
  // active area; anything larger is a typo that would rescale every model from this rig.
  if (Math.abs(declared - published) > 0.01) {
    throw inputInvalid(
      `A ${input.sensorFormat} sensor is ${published} mm wide, but the profile declares ${declared} mm.`,
      'Correct the profile and re-commission the station; the published width is what calibration is solved against.',
    );
  }
  if (!Number.isInteger(input.captureWidthPx) || !Number.isInteger(input.captureHeightPx)) {
    throw inputInvalid('Capture resolution must be whole pixels.', 'A fractional resolution is a resized image, not a sensor mode.');
  }
  if (input.captureHeightPx > input.captureWidthPx) {
    throw inputInvalid(`Capture is ${input.captureWidthPx}x${input.captureHeightPx} (portrait).`, 'A turntable frame is landscape; a turned rig produces a sideways model.');
  }
  if (!Number.isInteger(input.turntableSteps) || input.turntableSteps < 12) {
    throw inputInvalid(`Turntable steps ${input.turntableSteps} is not a usable revolution.`, 'The static path needs at least 12 steps; a photogrammetry run needs about 120.');
  }
  if (!Number.isFinite(Date.parse(input.commissionedAt))) {
    throw inputInvalid(`commissionedAt ${input.commissionedAt} is not an instant.`, 'Commissioning is a dated event; it is what a calibration is valid against.');
  }
  return Object.freeze({
    profileId: input.profileId.trim(),
    stationId: input.stationId.trim(),
    cameraModel: input.cameraModel.trim(),
    lensModel: input.lensModel.trim(),
    sensorFormat: input.sensorFormat,
    sensorWidthMm: declared,
    focalLengthMm: positive('focalLengthMm', input.focalLengthMm),
    captureWidthPx: input.captureWidthPx,
    captureHeightPx: input.captureHeightPx,
    turntableSteps: input.turntableSteps,
    firmware: input.firmware.trim(),
    commissionedAt: input.commissionedAt,
    protocolVersion: PROTOCOL_VERSION,
  });
}

/** Stable over every field that changes a measurement; the models and firmware are included on purpose. */
export function profileFingerprint(profile: DeviceProfile): string {
  const canonical = canonicalJson({
    profileId: profile.profileId,
    stationId: profile.stationId,
    cameraModel: profile.cameraModel,
    lensModel: profile.lensModel,
    sensorFormat: profile.sensorFormat,
    sensorWidthMm: profile.sensorWidthMm,
    focalLengthMm: profile.focalLengthMm,
    captureWidthPx: profile.captureWidthPx,
    captureHeightPx: profile.captureHeightPx,
    turntableSteps: profile.turntableSteps,
    firmware: profile.firmware,
    protocolVersion: profile.protocolVersion,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export interface ProfileVerdict {
  readonly ok: boolean;
  readonly failures: readonly string[];
  readonly fingerprint: string;
}

export function checkDeviceProfile(profile: DeviceProfile, requirement: ProfileRequirement = WATCH_CAPTURE_REQUIREMENT): ProfileVerdict {
  const failures: string[] = [];
  if (profile.captureWidthPx < requirement.minCaptureWidthPx) {
    failures.push(`capture width ${profile.captureWidthPx} px is below the ${requirement.minCaptureWidthPx} px minimum`);
  }
  if (profile.turntableSteps < requirement.minTurntableSteps) {
    failures.push(`turntable has ${profile.turntableSteps} steps; ${requirement.minTurntableSteps} are needed for a full-revolution mesh`);
  }
  const [lo, hi] = requirement.focalLengthRangeMm;
  if (profile.focalLengthMm < lo || profile.focalLengthMm > hi) {
    failures.push(`lens is ${profile.focalLengthMm} mm, outside ${lo}–${hi} mm for a watch at arm's length`);
  }
  if (!requirement.allowedSensorFormats.includes(profile.sensorFormat)) {
    failures.push(`sensor format ${profile.sensorFormat} is not accepted for this category`);
  }
  return { ok: failures.length === 0, failures: Object.freeze(failures), fingerprint: profileFingerprint(profile) };
}

export { SENSOR_WIDTH_MM };
