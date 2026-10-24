/**
 * Content addressing.
 *
 * Every artefact in this pipeline is named by the sha256 of its bytes. The rule that makes the
 * address worth having is the refusal: a step that receives bytes which do not hash to the expected
 * digest stops, and does not "repair" the digest to match. A rendition that changed between the
 * station and the origin is how a buyer sees a model that never passed QC.
 */

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { inputInvalid, checksumMismatch } from '../errors.js';

export const SHA256_HEX = /^[0-9a-f]{64}$/;
export const SHA256_PREFIXED = /^sha256:[0-9a-f]{64}$/;

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function sha256File(path: string): string {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw inputInvalid(`Cannot hash "${path}": ${message}`, 'Point the verifier at a file that exists and is readable.');
  }
}

export interface FileDigest {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export function digestFile(path: string): FileDigest {
  const bytes = statSync(path).size;
  return { path, bytes, sha256: sha256File(path) };
}

/** `sha256:` is stripped, never invented. A bare digest and a prefixed one name the same bytes. */
export function normalizeDigest(value: string): string {
  const digest = value.startsWith('sha256:') ? value.slice('sha256:'.length) : value;
  if (!SHA256_HEX.test(digest)) {
    throw inputInvalid(`"${value}" is not a sha256 digest.`, 'A digest is 64 lowercase hex characters, optionally prefixed with "sha256:".');
  }
  return digest;
}

/** Refuse a mismatch rather than logging it. The caller cannot continue past a different file. */
export function assertDigestMatch(what: string, expected: string, actual: string): void {
  const want = normalizeDigest(expected);
  const got = normalizeDigest(actual);
  if (want !== got) throw checksumMismatch(what, want, got);
}

export interface Addressable {
  readonly digest: string;
  readonly relativePath: string;
}

/**
 * Fan-out layout, two levels of two hex characters. 65 536 directories is enough that no single
 * directory holds an unbounded number of renditions, which is why every content-addressed store
 * does this and why the layout is fixed here rather than chosen per call.
 */
export function addressablePath(digest: string, fanout = 2): Addressable {
  const normalised = normalizeDigest(digest);
  if (!Number.isInteger(fanout) || fanout < 1 || fanout > 4) {
    throw inputInvalid(`Fanout ${fanout} is outside 1–4.`, 'A fanout wider than four levels makes paths unreadable for no storage gain.');
  }
  const segments = Array.from({ length: fanout }, (_, index) => normalised.slice(index * 2, index * 2 + 2));
  return { digest: normalised, relativePath: `${segments.join('/')}/${normalised}` };
}

export function assertAddressableAddress(relativePath: string, digest: string): void {
  const expected = addressablePath(digest).relativePath;
  if (relativePath !== expected) {
    throw inputInvalid(
      `"${relativePath}" is not the address of ${digest.slice(0, 12)}… (expected ${expected}).`,
      'Read the object by its digest path; a hand-chosen path is a path a second writer can collide with.',
    );
  }
}
