/**
 * LOD decimation behind an injectable encoder.
 *
 * No native geometry tool is installed in this build, and a test that needs Blender installed is a
 * test that never runs in CI. So decimation is defined as an interface and shipped with a
 * deterministic fake. The fake is not a stand-in for quality — it is a stand-in for the *contract*:
 * triangle counts, ratio accounting, monotonic tiers, and refusal when a tier would grow.
 *
 * The real encoder this would call is `gltf-transform simplify` (npm `@gltf-transform/cli`, MIT),
 * which uses meshoptimizer's simplifier (MIT). It is not installed here and nothing in this module
 * spawns it. `GLTF_TRANSFORM_DECIMATOR` records the binary and licence so the report and the
 * operator runbook do not have to guess.
 */

import { createHash } from 'node:crypto';
import { inputInvalid, nativeToolMissing } from '../errors.js';
import { PROTOCOL_VERSION } from '../station/protocol.js';

export interface DecimationRequest {
  readonly sourceId: string;
  readonly sourceBytes: Buffer;
  readonly sourceTriangles: number;
  /** Output triangles as a fraction of the source, 0 < ratio < 1. */
  readonly targetRatio: number;
}

export interface DecimationOutput {
  readonly bytes: Buffer;
  readonly triangles: number;
  readonly encoder: string;
}

export interface DecimationEncoder {
  readonly name: string;
  /** The executable a production install would run. Empty for the fake, which runs in-process. */
  readonly binary: string;
  readonly licence: string;
  decimate(request: DecimationRequest): Promise<DecimationOutput>;
}

export interface DecimationResult {
  readonly encoder: string;
  readonly sourceTriangles: number;
  readonly outputTriangles: number;
  readonly targetRatio: number;
  readonly achievedRatio: number;
  readonly bytes: number;
  readonly sha256: string;
}

/** The real tool, recorded rather than invoked. */
export const GLTF_TRANSFORM_DECIMATOR = {
  name: 'gltf-transform simplify',
  binary: 'gltf-transform',
  licence: 'MIT (@gltf-transform/cli); meshoptimizer is MIT',
  invocation: 'gltf-transform simplify <in.glb> <out.glb> --ratio <ratio> --error 0.001',
} as const;

/**
 * Deterministic in-process encoder. It writes a small JSON envelope rather than fake GLB bytes so
 * nobody can mistake its output for geometry: the payload says what it is, and a test that tries to
 * render it fails honestly.
 */
export class FakeDecimationEncoder implements DecimationEncoder {
  readonly name = 'fake-decimation';
  readonly binary = '';
  readonly licence = 'test double — produces no geometry';

  async decimate(request: DecimationRequest): Promise<DecimationOutput> {
    if (!Number.isFinite(request.targetRatio) || request.targetRatio <= 0 || request.targetRatio >= 1) {
      throw inputInvalid(`Decimation ratio ${request.targetRatio} is outside (0, 1).`, 'Ratio 1 is the source and ratio 0 is nothing; neither is a tier.');
    }
    if (!Number.isInteger(request.sourceTriangles) || request.sourceTriangles < 4) {
      throw inputInvalid(`Source has ${request.sourceTriangles} triangles.`, 'A mesh below four triangles is a plane, not a watch.');
    }
    const triangles = Math.max(4, Math.round(request.sourceTriangles * request.targetRatio));
    const payload = JSON.stringify({
      format: 'nastech-fake-mesh',
      protocol: PROTOCOL_VERSION,
      source: request.sourceId,
      sourceTriangles: request.sourceTriangles,
      triangles,
      targetRatio: Number(request.targetRatio.toFixed(6)),
      sourceSha256: createHash('sha256').update(request.sourceBytes).digest('hex'),
    });
    return { bytes: Buffer.from(payload, 'utf8'), triangles, encoder: this.name };
  }
}

export function requireEncoder(encoder: DecimationEncoder | null, forWhat = 'LOD decimation'): DecimationEncoder {
  if (encoder === null) {
    throw nativeToolMissing(GLTF_TRANSFORM_DECIMATOR.binary, `${forWhat} — no decimation encoder was supplied`);
  }
  return encoder;
}

export function toResult(output: DecimationOutput, request: DecimationRequest): DecimationResult {
  const sha256 = createHash('sha256').update(output.bytes).digest('hex');
  return Object.freeze({
    encoder: output.encoder,
    sourceTriangles: request.sourceTriangles,
    outputTriangles: output.triangles,
    targetRatio: request.targetRatio,
    achievedRatio: output.triangles / request.sourceTriangles,
    bytes: output.bytes.length,
    sha256,
  });
}

export interface DecimationChainInput {
  readonly sourceId: string;
  readonly sourceBytes: Buffer;
  readonly sourceTriangles: number;
  /** Ordered fine to coarse, e.g. [0.5, 0.2, 0.07] for lod0..lod2. */
  readonly ratios: readonly number[];
}

/** Each tier must be strictly coarser than the one before it, or the client downloads more for less. */
export function assertDescendingRatios(ratios: readonly number[]): void {
  if (ratios.length === 0) throw inputInvalid('A LOD chain needs at least one ratio.', 'Nothing to decimate.');
  for (let i = 0; i < ratios.length; i += 1) {
    const ratio = ratios[i]!;
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) {
      throw inputInvalid(`LOD ratio ${ratio} is outside (0, 1).`, 'Every tier is a fraction of the source mesh.');
    }
    if (i > 0 && ratio >= ratios[i - 1]!) {
      throw inputInvalid(
        `LOD ratios must descend; ${ratios[i - 1]} is followed by ${ratio}.`,
        'A coarser tier with a higher ratio makes lod2 heavier than lod1 and defeats the point of the ladder.',
      );
    }
  }
}

export async function decimateLodChain(
  encoder: DecimationEncoder | null,
  input: DecimationChainInput,
): Promise<readonly DecimationResult[]> {
  assertDescendingRatios(input.ratios);
  const active = requireEncoder(encoder, 'building the LOD chain');
  const results: DecimationResult[] = [];
  let previousTriangles = input.sourceTriangles;
  for (const ratio of input.ratios) {
    const request: DecimationRequest = {
      sourceId: input.sourceId,
      sourceBytes: input.sourceBytes,
      sourceTriangles: input.sourceTriangles,
      targetRatio: ratio,
    };
    const result = toResult(await active.decimate(request), request);
    if (result.outputTriangles >= previousTriangles) {
      throw inputInvalid(
        `Tier at ratio ${ratio} produced ${result.outputTriangles} triangles against ${previousTriangles} in the finer tier.`,
        'The encoder did not decimate. Refuse the chain rather than shipping a tier that grew.',
      );
    }
    previousTriangles = result.outputTriangles;
    results.push(result);
  }
  return Object.freeze(results);
}

/** A tier that misses its target by more than this is not the tier the client planned for. */
export function assertDecimationQuality(result: DecimationResult, maxRatioError = 0.02, minTriangles = 4): void {
  const error = Math.abs(result.achievedRatio - result.targetRatio);
  if (error > maxRatioError) {
    throw inputInvalid(
      `${result.encoder} hit ${result.achievedRatio.toFixed(4)} of the source against a ${result.targetRatio.toFixed(4)} target.`,
      `Re-run the encoder or adjust the target; a tier more than ${(maxRatioError * 100).toFixed(0)} % off its ratio is a different budget.`,
    );
  }
  if (result.outputTriangles < minTriangles) {
    throw inputInvalid(`Tier has ${result.outputTriangles} triangles.`, 'Below four triangles there is no surface left to evidence.');
  }
  if (!SHA256_OK.test(result.sha256)) {
    throw inputInvalid(`Tier digest ${result.sha256} is not a sha256.`, 'Hash the produced bytes before recording the tier.');
  }
}

const SHA256_OK = /^[0-9a-f]{64}$/;
