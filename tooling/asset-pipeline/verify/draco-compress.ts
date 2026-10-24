/**
 * Draco compression behind an injectable encoder.
 *
 * Draco is a real native/binary encoder and this environment has neither the binary nor a package
 * registry. Installing one to make a test pass would be the wrong trade: the thing that needs
 * testing is the pipeline's contract with a compressor — deterministic output, a verified decode,
 * a ratio that is actually smaller, and a refusal when compression inflates a tiny mesh.
 *
 * The real encoder this would call is Google Draco's `draco_encoder` (Apache-2.0), or
 * `gltf-transform draco` (MIT CLI) which wraps the `draco3d` encoder (Apache-2.0). Neither is
 * installed. `GOOGLE_DRACO` records the binary and licence for the report.
 *
 * The fake writes a binary envelope rather than pretending to be a Draco bitstream: a caller that
 * tries to feed it to a real decoder gets a magic mismatch instead of silently wrong geometry.
 */

import { createHash } from 'node:crypto';
import { inputInvalid, nativeToolMissing } from '../errors.js';

export const DRACO_MAGIC = Buffer.from('DRACOFK1', 'ascii');
const HEADER_BYTES = DRACO_MAGIC.length + 4 + 1 + 32;

export interface MeshCompressionRequest {
  readonly sourceId: string;
  readonly sourceBytes: Buffer;
  readonly sourceTriangles: number;
  /** 0–10, passed to the encoder. Kept explicit because quality changes bytes and fidelity. */
  readonly quality: number;
}

export interface CompressedMesh {
  readonly bytes: Buffer;
  readonly triangles: number;
  readonly encoder: string;
}

export interface MeshCompressor {
  readonly name: string;
  readonly binary: string;
  readonly licence: string;
  compress(request: MeshCompressionRequest): Promise<CompressedMesh>;
  /**
   * A real deployment pairs the encoder with `draco_decoder`. Verification is mandatory, so an
   * encoder without a decoder cannot be used to publish — see `compressMesh`.
   */
  decode?(bytes: Buffer): { readonly triangles: number; readonly sourceSha256: string | null };
}

export const GOOGLE_DRACO = {
  name: 'Google Draco',
  binary: 'draco_encoder',
  licence: 'Apache-2.0',
  invocation: 'draco_encoder -i <in.glb> -o <out.drc> -qp <quality>',
  alternative: 'gltf-transform draco <in.glb> <out.glb> --quantize-position 14 (MIT CLI, Apache-2.0 draco3d)',
} as const;

/** Deterministic, in-process, and explicitly not a Draco bitstream. */
export class FakeDracoCompressor implements MeshCompressor {
  readonly name = 'fake-draco';
  readonly binary = '';
  readonly licence = 'test double — produces no Draco bitstream';

  decode(bytes: Buffer): { readonly triangles: number; readonly sourceSha256: string } {
    const header = readFakeHeader(bytes);
    return { triangles: header.triangles, sourceSha256: header.sourceSha256 };
  }

  async compress(request: MeshCompressionRequest): Promise<CompressedMesh> {
    if (!Number.isInteger(request.sourceTriangles) || request.sourceTriangles < 4) {
      throw inputInvalid(`Source has ${request.sourceTriangles} triangles.`, 'A mesh below four triangles is a plane.');
    }
    if (!Number.isInteger(request.quality) || request.quality < 0 || request.quality > 10) {
      throw inputInvalid(`Draco quality ${request.quality} is outside 0–10.`, 'Quality is the encoder’s own scale, not a percentage.');
    }
    if (request.sourceBytes.length === 0) throw inputInvalid('Source mesh is empty.', 'There are no bytes to compress.');
    const digest = createHash('sha256').update(request.sourceBytes).digest();
    const header = Buffer.alloc(HEADER_BYTES);
    DRACO_MAGIC.copy(header, 0);
    header.writeUInt32LE(request.sourceTriangles, DRACO_MAGIC.length);
    header.writeUInt8(request.quality, DRACO_MAGIC.length + 4);
    digest.copy(header, DRACO_MAGIC.length + 5);
    // A fingerprinted body proportional to the triangle count, so size comparisons are not a
    // constant 45 bytes for every mesh.
    const body = Buffer.alloc(Math.max(64, Math.round(request.sourceTriangles / 8)));
    for (let index = 0; index < body.length; index += 1) body[index] = digest[index % digest.length]! ^ (index & 0xff);
    return {
      bytes: Buffer.concat([header, body]),
      triangles: request.sourceTriangles,
      encoder: this.name,
    };
  }
}

export interface FakeHeader {
  readonly triangles: number;
  readonly quality: number;
  readonly sourceSha256: string;
}

/** Reads the fake's header. A real Draco stream fails the magic check on purpose. */
export function readFakeHeader(bytes: Buffer): FakeHeader {
  if (bytes.length < HEADER_BYTES || !bytes.subarray(0, DRACO_MAGIC.length).equals(DRACO_MAGIC)) {
    throw inputInvalid('Bytes are not a fake-Draco envelope.', 'Only the deterministic fake can be decoded here; a real Draco stream needs draco_decoder.');
  }
  return {
    triangles: bytes.readUInt32LE(DRACO_MAGIC.length),
    quality: bytes.readUInt8(DRACO_MAGIC.length + 4),
    sourceSha256: bytes.subarray(DRACO_MAGIC.length + 5, HEADER_BYTES).toString('hex'),
  };
}

export interface CompressionReport {
  readonly encoder: string;
  readonly sourceBytes: number;
  readonly compressedBytes: number;
  readonly ratio: number;
  readonly triangles: number;
  readonly sha256: string;
  readonly roundTripSha256: string;
}

export interface CompressionCheck {
  readonly maxRatio: number;
  readonly minTriangles: number;
}

export const DEFAULT_COMPRESSION_CHECK: CompressionCheck = { maxRatio: 0.85, minTriangles: 4 };

/**
 * Compress and verify in one step. The round-trip digest is read from the encoder's own header —
 * that is the fake's decoder — and compared with the source: a compressor that reordered the mesh
 * is allowed to change the file, but one that lost the geometry is not.
 */
export async function compressMesh(
  compressor: MeshCompressor | null,
  request: MeshCompressionRequest,
  check: CompressionCheck = DEFAULT_COMPRESSION_CHECK,
): Promise<CompressionReport> {
  if (compressor === null) {
    throw nativeToolMissing(GOOGLE_DRACO.binary, 'Draco compression — no compressor was supplied');
  }
  const compressed = await compressor.compress(request);
  if (!compressor.decode) {
    throw nativeToolMissing('draco_decoder', 'verifying a compressed mesh — an encoder without a decoder cannot prove the geometry survived');
  }
  const header = compressor.decode(compressed.bytes);
  const sourceSha = createHash('sha256').update(request.sourceBytes).digest('hex');
  if (header.triangles !== request.sourceTriangles) {
    throw inputInvalid(
      `${compressor.name} reports ${header.triangles} triangles for a ${request.sourceTriangles}-triangle source.`,
      'A compressed mesh that changed topology is a different object; re-run the encoder.',
    );
  }
  if (header.sourceSha256 !== null && header.sourceSha256 !== sourceSha) {
    throw inputInvalid(`${compressor.name} decoded to a different source digest.`, 'The decoder and encoder disagree about what was compressed; do not publish.');
  }
  if (compressed.bytes.length >= request.sourceBytes.length) {
    throw inputInvalid(
      `${compressor.name} produced ${compressed.bytes.length} bytes from ${request.sourceBytes.length}.`,
      'Compression that grows the file is a regression, not an optimisation; keep the source tier.',
    );
  }
  const ratio = compressed.bytes.length / request.sourceBytes.length;
  if (ratio > check.maxRatio) {
    throw inputInvalid(
      `${compressor.name} reached ${(ratio * 100).toFixed(1)} % of source; the tier budget requires <= ${(check.maxRatio * 100).toFixed(0)} %.`,
      'Raise the quantisation or lower the texture resolution; do not publish a tier over its budget.',
    );
  }
  if (header.triangles < check.minTriangles) throw inputInvalid(`Compressed mesh has ${header.triangles} triangles.`, 'Nothing left to evidence.');
  return {
    encoder: compressor.name,
    sourceBytes: request.sourceBytes.length,
    compressedBytes: compressed.bytes.length,
    ratio,
    triangles: header.triangles,
    sha256: createHash('sha256').update(compressed.bytes).digest('hex'),
    roundTripSha256: header.sourceSha256 ?? 'unavailable',
  };
}

export function describeCompression(report: CompressionReport): string {
  return `${report.encoder}: ${report.sourceBytes.toLocaleString('en-ZA')} → ${report.compressedBytes.toLocaleString('en-ZA')} bytes (${(report.ratio * 100).toFixed(1)} %), ${report.triangles} triangles, sha256:${report.sha256.slice(0, 16)}…`;
}
