/**
 * ZIP integrity.
 *
 * The station exports a session as a zip and the origin receives it as a zip. "The file opens" is
 * not a test: a truncated archive can still open, and a single flipped byte inside a deflated entry
 * still inflates into plausible pixels. So this verifier reads the central directory, then walks
 * every entry, inflates it, checks the declared uncompressed size and the CRC-32 from the central
 * directory, and refuses on any difference.
 *
 * It also refuses the shapes that are dangerous rather than merely corrupt: encrypted entries (we
 * cannot verify what we cannot read), zip64 (not needed for a 120-frame session and easy to get
 * subtly wrong), multi-disk archives, duplicate names, and path traversal.
 *
 * The parser is deliberately narrow. A general-purpose unzip is a larger attack surface than this
 * pipeline needs, and every format feature we do not implement is a feature we cannot be tricked by.
 */

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { inputInvalid, zipCorrupt } from '../errors.js';

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const EOCD_MIN_BYTES = 22;
const MAX_COMMENT = 0xffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  readonly name: string;
  readonly method: 'store' | 'deflate';
  readonly compressedBytes: number;
  readonly bytes: number;
  readonly crc32: string;
  readonly sha256: string;
}

export interface ZipReport {
  readonly archive: string;
  readonly entries: readonly ZipEntry[];
  readonly totalBytes: number;
  readonly compressedBytes: number;
  readonly comment: string;
}

export interface ZipOptions {
  readonly requireEntries?: number;
  readonly maxTotalUncompressedBytes?: number;
  readonly maxEntryBytes?: number;
  /** Directory entries end with "/" and carry no data; a session archive does not need them. */
  readonly allowDirectories?: boolean;
}

function safeName(name: string): void {
  if (name.length === 0) throw new Error('an entry has an empty name');
  if (name.startsWith('/') || name.startsWith('\\')) throw new Error(`entry "${name}" is absolute`);
  if (/^[A-Za-z]:/.test(name)) throw new Error(`entry "${name}" carries a drive letter`);
  const segments = name.split(/[\\/]/);
  if (segments.some((segment) => segment === '..')) throw new Error(`entry "${name}" traverses out of the archive`);
}

function readU16(buffer: Buffer, offset: number): number {
  if (offset + 2 > buffer.length) throw new Error('truncated 16-bit field');
  return buffer.readUInt16LE(offset);
}

function readU32(buffer: Buffer, offset: number): number {
  if (offset + 4 > buffer.length) throw new Error('truncated 32-bit field');
  return buffer.readUInt32LE(offset);
}

function findEocd(buffer: Buffer): number {
  const earliest = Math.max(0, buffer.length - EOCD_MIN_BYTES - MAX_COMMENT);
  for (let offset = buffer.length - EOCD_MIN_BYTES; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIG) {
      const commentLength = buffer.readUInt16LE(offset + 20);
      if (offset + EOCD_MIN_BYTES + commentLength === buffer.length) return offset;
    }
  }
  throw new Error('no end-of-central-directory record');
}

export function verifyZipBytes(buffer: Buffer, archive: string, options: ZipOptions = {}): ZipReport {
  try {
    return inspect(buffer, archive, options);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw zipCorrupt(archive, reason);
  }
}

export function verifyZip(path: string, options: ZipOptions = {}): ZipReport {
  let buffer: Buffer;
  try {
    buffer = readFileSync(path);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw inputInvalid(`Cannot read archive "${path}": ${reason}`, 'Point the verifier at the archive the station exported.');
  }
  return verifyZipBytes(buffer, path, options);
}

function inspect(buffer: Buffer, archive: string, options: ZipOptions): ZipReport {
  if (buffer.length < EOCD_MIN_BYTES) throw new Error('file is shorter than an empty archive');
  const eocd = findEocd(buffer);
  const disk = readU16(buffer, eocd + 4);
  const cdDisk = readU16(buffer, eocd + 6);
  const entriesOnDisk = readU16(buffer, eocd + 8);
  const totalEntries = readU16(buffer, eocd + 10);
  const cdSize = readU32(buffer, eocd + 12);
  const cdOffset = readU32(buffer, eocd + 16);
  const commentLength = readU16(buffer, eocd + 20);

  if (disk !== 0 || cdDisk !== 0) throw new Error('multi-disk archives are not supported');
  if (totalEntries === 0xffff || entriesOnDisk === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error('zip64 archive: not supported for a capture session');
  }
  if (entriesOnDisk !== totalEntries) throw new Error('central directory entry counts disagree across disks');
  if (cdOffset + cdSize > eocd) throw new Error('central directory overlaps the end record');
  if (options.requireEntries !== undefined && totalEntries !== options.requireEntries) {
    throw new Error(`${totalEntries} entries, expected ${options.requireEntries}`);
  }

  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let totalBytes = 0;
  let compressedBytes = 0;
  let cursor = cdOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (readU32(buffer, cursor) !== CENTRAL_SIG) throw new Error(`central header ${index} has the wrong signature`);
    const flags = readU16(buffer, cursor + 8);
    const method = readU16(buffer, cursor + 10);
    const declaredCrc = readU32(buffer, cursor + 16);
    const compressedSize = readU32(buffer, cursor + 20);
    const uncompressedSize = readU32(buffer, cursor + 24);
    const nameLength = readU16(buffer, cursor + 28);
    const extraLength = readU16(buffer, cursor + 30);
    const commentLen = readU16(buffer, cursor + 32);
    const diskStart = readU16(buffer, cursor + 34);
    const localOffset = readU32(buffer, cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    const next = cursor + 46 + nameLength + extraLength + commentLen;

    if ((flags & 0x0001) !== 0) throw new Error(`entry "${name}" is encrypted; its plaintext cannot be verified`);
    if ((flags & 0x0041) !== 0) throw new Error(`entry "${name}" uses a feature this verifier does not implement (flags 0x${flags.toString(16)})`);
    if (diskStart !== 0) throw new Error(`entry "${name}" starts on another disk`);
    if (method !== 0 && method !== 8) throw new Error(`entry "${name}" uses compression method ${method}; only store and deflate are accepted`);
    safeName(name);
    if (names.has(name)) throw new Error(`duplicate entry name "${name}"`);
    names.add(name);

    if (localOffset + 30 > cdOffset) throw new Error(`entry "${name}" points outside the data area`);
    if (readU32(buffer, localOffset) !== LOCAL_SIG) throw new Error(`entry "${name}" has no local header`);
    const localFlags = readU16(buffer, localOffset + 6);
    const localMethod = readU16(buffer, localOffset + 8);
    const localNameLength = readU16(buffer, localOffset + 26);
    const localExtraLength = readU16(buffer, localOffset + 28);
    const localName = buffer.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString('utf8');
    if (localName !== name) throw new Error(`entry "${name}" has local name "${localName}"`);
    if (localMethod !== method) throw new Error(`entry "${name}" has method ${localMethod} locally and ${method} centrally`);
    if ((localFlags & 0x0001) !== 0) throw new Error(`entry "${name}" is encrypted`);

    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > cdOffset) throw new Error(`entry "${name}" runs past the central directory`);
    const stored = buffer.subarray(dataStart, dataStart + compressedSize);

    let plain: Buffer;
    if (method === 0) {
      plain = Buffer.from(stored);
    } else {
      try {
        plain = inflateRawSync(stored, { maxOutputLength: Math.max(uncompressedSize, 1) });
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`entry "${name}" does not inflate: ${reason}`);
      }
    }
    if (plain.length !== uncompressedSize) {
      throw new Error(`entry "${name}" inflates to ${plain.length} bytes, central directory says ${uncompressedSize}`);
    }
    const actualCrc = crc32(plain);
    if (actualCrc !== declaredCrc) {
      throw new Error(`entry "${name}" CRC is ${actualCrc.toString(16)}, central directory says ${declaredCrc.toString(16)}`);
    }
    if (options.maxEntryBytes !== undefined && plain.length > options.maxEntryBytes) {
      throw new Error(`entry "${name}" is ${plain.length} bytes, over the ${options.maxEntryBytes}-byte entry limit`);
    }
    totalBytes += plain.length;
    compressedBytes += compressedSize;
    entries.push({
      name,
      method: method === 0 ? 'store' : 'deflate',
      compressedBytes: compressedSize,
      bytes: plain.length,
      crc32: actualCrc.toString(16).padStart(8, '0'),
      sha256: createHash('sha256').update(plain).digest('hex'),
    });
    cursor = next;
  }

  if (cursor !== cdOffset + cdSize) throw new Error('central directory size does not match its entries');
  if (options.maxTotalUncompressedBytes !== undefined && totalBytes > options.maxTotalUncompressedBytes) {
    throw new Error(`archive expands to ${totalBytes} bytes, over the ${options.maxTotalUncompressedBytes}-byte budget`);
  }
  const directories = entries.filter((entry) => entry.name.endsWith('/'));
  if (directories.length > 0 && !(options.allowDirectories ?? false)) {
    throw new Error(`archive contains ${directories.length} directory entr${directories.length === 1 ? 'y' : 'ies'}; a session archive holds files only`);
  }
  const comment = buffer.subarray(eocd + EOCD_MIN_BYTES, eocd + EOCD_MIN_BYTES + commentLength).toString('utf8');
  return {
    archive,
    entries: Object.freeze(entries),
    totalBytes,
    compressedBytes,
    comment,
  };
}
