/**
 * Private-bucket upload.
 *
 * Three properties, each because of a specific way this goes wrong in practice:
 *
 * - **bytes the manifest did not describe never leave the studio.** Every file is hashed locally and
 *   compared to the rendition's declared digest before a single chunk is sent. Uploading something
 *   else under a published key is how a listing ends up showing a watch nobody inspected.
 * - **keys are immutable.** `private/media/<assetId>/v<version>/<tier>` is written once. A re-shoot
 *   opens a new version rather than overwriting, because a buyer who saw the item last week and a
 *   dispute reader next month have to be able to get the same bytes. A second put under a key that
 *   already holds different content is a refusal, not an update.
 * - **credentials are never in a log line.** Everything this module can emit goes through `redact`,
 *   which scrubs the secret values it was given plus the shapes of common tokens. Bucket *object*
 *   keys are printed on purpose — an operator has to be able to find the object again; secrets are
 *   not how that happens.
 *
 * There is no bucket and no network in this environment. `resolveTransport` therefore throws
 * `bucket_unavailable` and the CLI exits non-zero: `publish` cannot report a success it did not have.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { CaptureError, bucketUnavailable, checksumMismatch, inputInvalid, renditionSizeMissing } from './errors.js';
import type { LodTier, Rendition } from '@nastech/api-contracts';

/**
 * 8 MiB. Sits above the 5 MiB multipart minimum (below it, every part but the last is rejected by the
 * S3 API), and keeps peak memory at one buffer per in-flight part so the studio's 4 GB capture
 * machine never holds the whole asset. The largest legal rendition is 2.5 MB, so a conforming asset
 * is a single chunk — the plan is still per-chunk because the day an asset is bigger, the resume path
 * has to already exist.
 */
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
export const MULTIPART_MIN_PART_BYTES = 5 * 1024 * 1024;
export const BUCKET_PREFIX = 'private/media';

export interface Chunk {
  readonly index: number;
  readonly offset: number;
  readonly length: number;
  readonly sha256: string;
}

export function chunkPlan(bytes: number, chunkBytes: number = UPLOAD_CHUNK_BYTES): readonly Chunk[] {
  if (!Number.isInteger(bytes) || bytes < 0) {
    throw inputInvalid(`Cannot plan an upload of ${bytes} bytes.`, 'Size must be a whole number of bytes from the file on disk.');
  }
  if (chunkBytes <= 0) throw inputInvalid(`Chunk size ${chunkBytes} cannot plan an upload.`, 'Chunk size is a positive number of bytes.');
  // S3's rule is about parts, not sizes: a single PUT may be any size, but every non-final part of a
  // multipart upload must be at least 5 MiB. So the floor only bites once the plan has a second part.
  if (bytes > chunkBytes && chunkBytes < MULTIPART_MIN_PART_BYTES) {
    throw inputInvalid(
      `A ${bytes}-byte object in ${chunkBytes}-byte chunks would create parts below the ${MULTIPART_MIN_PART_BYTES}-byte multipart floor.`,
      'Either raise the chunk size to 5 MiB or above, or upload it as a single PUT.',
    );
  }
  const plan: Chunk[] = [];
  // `|| index === 0` keeps a zero-byte file a one-chunk plan, which then fails the size check rather
  // than silently looking like an empty successful upload.
  for (let offset = 0, index = 0; offset < bytes || index === 0; offset += chunkBytes, index += 1) {
    plan.push({ index, offset, length: Math.min(chunkBytes, bytes - offset), sha256: 'unset' });
  }
  return Object.freeze(plan);
}

/** Fill in real per-chunk digests from the bytes on disk, so an interrupted upload can resume honestly. */
export function hashChunks(buffer: Buffer, plan: readonly Chunk[]): Chunk[] {
  return plan.map((chunk) => ({
    ...chunk,
    sha256: createHash('sha256').update(buffer.subarray(chunk.offset, chunk.offset + chunk.length)).digest('hex'),
  }));
}

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'model/gltf-binary': 'glb',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/png': 'png',
};

export function extensionFor(mime: string): string {
  const ext = EXTENSION_BY_MIME[mime];
  if (!ext) throw inputInvalid(`No object extension is defined for mime "${mime}".`, 'Add the mime to the upload map rather than writing an extension-less key.');
  return ext;
}

export interface RenditionKeyInput {
  readonly assetId: string;
  readonly version: number;
  readonly lod: LodTier;
  readonly mime: string;
  /** Distinguishes the turntable strip from the poster, both of which live at the poster lod. */
  readonly suffix?: string;
}

/** Deterministic, version-scoped, and private by construction. */
export function deriveRenditionKey(input: RenditionKeyInput): string {
  const stem = input.suffix === undefined ? input.lod : `${input.lod}-${input.suffix}`;
  return `${BUCKET_PREFIX}/${input.assetId}/v${input.version}/${stem}.${extensionFor(input.mime)}`;
}

export function assertPrivateBucket(bucket: string): void {
  if (/public|cdn/i.test(bucket)) {
    throw inputInvalid(`Refusing to write capture evidence to a bucket named "${bucket}".`, 'Capture originals belong in the private bucket; a public bucket has no chain of custody.');
  }
}

export interface BucketCredentials {
  readonly endpoint: string;
  readonly bucket: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export const CREDENTIAL_ENV: Readonly<Record<keyof BucketCredentials, string>> = {
  endpoint: 'NASTECH_MEDIA_BUCKET_ENDPOINT',
  bucket: 'NASTECH_MEDIA_BUCKET',
  region: 'NASTECH_MEDIA_BUCKET_REGION',
  accessKeyId: 'NASTECH_MEDIA_ACCESS_KEY_ID',
  secretAccessKey: 'NASTECH_MEDIA_SECRET_ACCESS_KEY',
};

export function readCredentials(env: NodeJS.ProcessEnv = process.env): BucketCredentials {
  const missing = Object.values(CREDENTIAL_ENV).filter((name) => !(env[name] ?? '').trim());
  if (missing.length > 0) throw bucketUnavailable(missing);
  const value = (name: string): string => (env[name] ?? '').trim();
  const credentials: BucketCredentials = {
    endpoint: value(CREDENTIAL_ENV.endpoint),
    bucket: value(CREDENTIAL_ENV.bucket),
    region: value(CREDENTIAL_ENV.region),
    accessKeyId: value(CREDENTIAL_ENV.accessKeyId),
    secretAccessKey: value(CREDENTIAL_ENV.secretAccessKey),
  };
  assertPrivateBucket(credentials.bucket);
  return credentials;
}

const TOKEN_SHAPES = [/AKIA[0-9A-Z]{16}/g, /BEGIN [A-Z ]*PRIVATE KEY/g, /x-amz-security-token=[^&\s]+/gi];

/**
 * Applied to every string this module can emit: an error message that quotes a credential turns a
 * pipeline log into a leaked key, and pipeline logs are read by people who did not set the credential.
 * The long-base64 pattern is deliberately left out — it eats bucket digests and made refusal messages
 * unreadable, and the two shapes above are the ones that actually appear in S3 error bodies.
 */
export function redact(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length >= 6) out = out.split(secret).join('[redacted]');
  }
  for (const pattern of TOKEN_SHAPES) out = out.replace(pattern, '[redacted]');
  return out;
}

export interface ObjectHead {
  readonly bytes: number;
  /** Null when the backend cannot report a checksum — the local digest still has to match. */
  readonly sha256: string | null;
}

export interface BucketTransport {
  readonly name: string;
  head(key: string): Promise<ObjectHead | null>;
  putFile(key: string, filePath: string, chunks: readonly Chunk[]): Promise<ObjectHead>;
}

/**
 * Only the AWS CLI's `s3api` verbs are constructed here, because those are the commands the studio
 * runbook uses. Other clients (rclone, s5cmd) would need their own argument shapes; pretending a
 * guessed argv is portable is how a pipeline half-uploads an asset and reports success.
 */
export function awsCliTransport(env: NodeJS.ProcessEnv = process.env): BucketTransport {
  const credentials = readCredentials(env);
  const run = (args: readonly string[], label: string, missingIsOk = false): string => {
    const result = spawnSync('aws', args, {
      encoding: 'utf8',
      env: {
        ...env,
        AWS_ACCESS_KEY_ID: credentials.accessKeyId,
        AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
        AWS_DEFAULT_REGION: credentials.region,
      },
    });
    if (result.status !== 0) {
      const detail = (result.stderr ?? '') + (result.stdout ?? '');
      // A HEAD on an object that does not exist yet is the normal first publish, and the CLI reports
      // it as a non-zero exit. Treating that as a dead bucket would make the very first upload of every
      // asset fail, so the 404 shapes are read as "nothing stored here" and everything else throws.
      if (missingIsOk && /404|NotFound|NoSuchKey/i.test(detail)) return '';
      throw new CaptureError(
        'bucket_unavailable',
        redact(`aws s3api ${label} failed: ${detail.trim().slice(0, 200) || 'no output captured'}`, [
          credentials.secretAccessKey,
          credentials.accessKeyId,
        ]),
        'Nothing partial counts as uploaded. Fix the credential or endpoint and re-run publish.',
        { label },
      );
    }
    return result.stdout ?? '';
  };
  const base = ['--endpoint-url', credentials.endpoint];
  const headObject = async (key: string): Promise<ObjectHead | null> => {
    const out = run(['s3api', 'head-object', ...base, '--bucket', credentials.bucket, '--key', key], 'head-object', true);
    const length = /"ContentLength"\s*:\s*(\d+)/i.exec(out);
    if (!length) return null;
    const checksum = /"ChecksumSHA256"\s*:\s*"([^"]+)"/i.exec(out);
    return { bytes: Number(length[1]), sha256: checksum?.[1] ? Buffer.from(checksum[1], 'base64').toString('hex') : null };
  };
  return {
    name: `aws:${credentials.bucket}`,
    head: headObject,
    async putFile(key: string, filePath: string, chunks: readonly Chunk[]): Promise<ObjectHead> {
      // Single-part put for conforming assets; the chunk plan is what a >8 MiB object would be
      // created from via `create-multipart-upload` / `upload-part` on the same client.
      for (const chunk of chunks) {
        if (!/^[0-9a-f]{64}$/.test(chunk.sha256)) throw inputInvalid(`Chunk ${chunk.index} has no digest.`, 'Hash the chunk plan before putting it.');
      }
      run(
        ['s3api', 'put-object', ...base, '--bucket', credentials.bucket, '--key', key, '--body', filePath, '--checksum-algorithm', 'SHA256', '--server-side-encryption', 'AES256'],
        'put-object',
      );
      const stored = await headObject(key);
      if (!stored) throw inputInvalid(`Object ${key} is not readable back after the put.`, 'An asset nobody can head is not uploaded; check the endpoint and re-run publish.');
      return stored;
    },
  };
}

/** What it would take to move bytes here. In this environment: nothing, and it says so. */
export function resolveTransport(env: NodeJS.ProcessEnv = process.env): BucketTransport {
  const missingCredentials: string[] = [];
  try {
    readCredentials(env);
  } catch (cause) {
    // A bucket named "public" is not a missing credential — it is a refusal that must not be
    // softened into "set the env vars", because setting them would not make it legal.
    if (!(cause instanceof CaptureError) || cause.code !== 'bucket_unavailable') throw cause;
    const listed = cause.context.missing;
    if (Array.isArray(listed)) missingCredentials.push(...(listed as string[]));
  }
  // The probe uses the same env the credentials came from: an injected PATH has to be able to say both
  // "there is a client here" and "there is not", or the check would read the machine rather than the run.
  const client = spawnSync('aws', ['--version'], { encoding: 'utf8', env });
  const hasClient = !client.error && client.status === 0;
  if (!hasClient || missingCredentials.length > 0) {
    throw bucketUnavailable(hasClient ? missingCredentials : ['aws (s3 client)', ...missingCredentials]);
  }
  return awsCliTransport(env);
}

export interface UploadTarget {
  readonly rendition: Rendition;
  /** Where the produced bytes are on the studio disk. */
  readonly localPath: string;
}

export type UploadStatus = 'uploaded' | 'already_present';

export interface UploadReceipt {
  readonly renditionId: string;
  readonly bucketKey: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly status: UploadStatus;
  readonly chunks: number;
}

export function declaredDigest(rendition: Rendition): string {
  const digest = rendition.sha256.startsWith('sha256:') ? rendition.sha256.slice('sha256:'.length) : rendition.sha256;
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    throw renditionSizeMissing(rendition.id, `the manifest declares "${rendition.sha256}", which is not a file digest`);
  }
  return digest;
}

/**
 * Put every rendition, verifying the digest before and after the move. A refusal issues no receipt, so
 * a partial upload can never be mistaken for a published asset.
 */
export async function uploadRenditions(
  targets: readonly UploadTarget[],
  transport: BucketTransport,
): Promise<readonly UploadReceipt[]> {
  if (targets.length === 0) throw inputInvalid('No renditions were given to upload.', 'Generate the LOD chain first; an empty upload is not a success.');
  const receipts: UploadReceipt[] = [];
  for (const target of targets) {
    const { rendition } = target;
    if (!existsSync(target.localPath)) {
      throw inputInvalid(`Rendition ${rendition.id} points at "${target.localPath}", which is not on disk.`, 'The produced file must still exist to be uploaded; re-run process.');
    }
    const body = readFileSync(target.localPath);
    const actual = createHash('sha256').update(body).digest('hex');
    const expected = declaredDigest(rendition);
    if (actual !== expected) throw checksumMismatch(rendition.id, expected, actual);
    if (rendition.bytes !== body.length) {
      throw renditionSizeMissing(rendition.id, `the manifest says ${rendition.bytes} bytes, the file is ${body.length}`);
    }

    const plan = hashChunks(body, chunkPlan(body.length));
    const remote = await transport.head(rendition.bucketKey);
    if (remote !== null) {
      if (remote.sha256 !== null && remote.sha256 !== actual) {
        throw checksumMismatch(rendition.id, `${actual} (local)`, `${remote.sha256} (already stored at ${rendition.bucketKey})`);
      }
      receipts.push({ renditionId: rendition.id, bucketKey: rendition.bucketKey, bytes: remote.bytes, sha256: `sha256:${actual}`, status: 'already_present', chunks: plan.length });
      continue;
    }
    const written = await transport.putFile(rendition.bucketKey, target.localPath, plan);
    if (written.bytes !== body.length) {
      throw renditionSizeMissing(rendition.id, `the bucket accepted ${written.bytes} of ${body.length} bytes`);
    }
    if (written.sha256 !== null && written.sha256 !== actual) throw checksumMismatch(rendition.id, actual, written.sha256);
    receipts.push({ renditionId: rendition.id, bucketKey: rendition.bucketKey, bytes: body.length, sha256: `sha256:${actual}`, status: 'uploaded', chunks: plan.length });
  }
  return Object.freeze(receipts);
}

export function describeUpload(receipts: readonly UploadReceipt[]): string {
  return receipts
    .map((r) => `${r.status.padEnd(15)} ${r.bucketKey}  ${r.bytes.toLocaleString('en-ZA')} bytes in ${r.chunks} chunk(s)  ${r.sha256.slice(0, 19)}…`)
    .join('\n');
}
