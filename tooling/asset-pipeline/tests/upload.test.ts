import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LodTier, Rendition } from '@nastech/api-contracts';
import { CaptureError } from '../errors.js';
import {
  BUCKET_PREFIX,
  MULTIPART_MIN_PART_BYTES,
  UPLOAD_CHUNK_BYTES,
  assertPrivateBucket,
  chunkPlan,
  declaredDigest,
  deriveRenditionKey,
  describeUpload,
  extensionFor,
  hashChunks,
  readCredentials,
  redact,
  resolveTransport,
  uploadRenditions,
} from '../upload.js';
import type { BucketTransport, ObjectHead, UploadReceipt } from '../upload.js';

const digest = (text: string): string => createHash('sha256').update(text).digest('hex');

/** A scratch dir per test: uploads read real bytes off disk, so the fixture has to be real too. */
function workspace(files: Record<string, string>): { dir: string; pathFor: (name: string) => string } {
  const dir = mkdtempSync(join(tmpdir(), 'nastech-upload-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body, 'utf8');
  return { dir, pathFor: (name: string) => join(dir, name) };
}

function rendition(over: Partial<Rendition> = {}): Rendition {
  return {
    id: 'ren_ast_017_v1_lod0',
    kind: 'MODEL',
    lod: 'lod0',
    bytes: 0,
    sha256: 'sha256:unset',
    bucketKey: `${BUCKET_PREFIX}/ast_017/v1/lod0.glb`,
    mime: 'model/gltf-binary',
    ...over,
  };
}

interface FakeBucketOptions {
  /** Objects already in the bucket before this run. */
  readonly existing?: Record<string, ObjectHead>;
  /** What the bucket reports back after a put. */
  readonly stored?: (key: string, bytes: number) => ObjectHead;
}

function fakeBucket(options: FakeBucketOptions = {}): BucketTransport & { puts: string[] } {
  const heads = new Map<string, ObjectHead>(Object.entries(options.existing ?? {}));
  const puts: string[] = [];
  return {
    name: 'fake:local-scratch',
    puts,
    async head(key: string) {
      return heads.get(key) ?? null;
    },
    async putFile(key: string, filePath: string, chunks) {
      puts.push(key);
      const body = readFileSync(filePath);
      for (const chunk of chunks) {
        if (!/^[0-9a-f]{64}$/.test(chunk.sha256)) throw new Error(`chunk ${chunk.index} arrived unhashed`);
      }
      const stored = options.stored?.(key, body.length) ?? { bytes: body.length, sha256: digestOf(body) };
      heads.set(key, stored);
      return stored;
    },
  };
}

const digestOf = (body: Buffer): string => createHash('sha256').update(body).digest('hex');
describe('chunk plan', () => {
  test('a 20 MB original splits into whole parts plus a remainder', () => {
    const plan = chunkPlan(20 * 1024 * 1024);
    expect(plan.length).toBe(3);
    expect(plan[0]).toMatchObject({ index: 0, offset: 0, length: UPLOAD_CHUNK_BYTES });
    expect(plan[2]!.length).toBe(20 * 1024 * 1024 - 2 * UPLOAD_CHUNK_BYTES);
    expect(plan.reduce((sum, c) => sum + c.length, 0)).toBe(20 * 1024 * 1024);
  });

  test('a plan whose non-final parts fall under the multipart floor is refused', () => {
    // S3 rejects every non-final part below 5 MiB, so such a plan would "succeed" locally and fail
    // after the first part has already been paid for.
    expect(() => chunkPlan(20 * 1024 * 1024, 1024 * 1024)).toThrow(CaptureError);
    expect(() => chunkPlan(3 * 1024 * 1024, 1024 * 1024)).toThrow(CaptureError);
    // a single-part object is one PUT, so the floor does not apply to it
    expect(chunkPlan(3 * 1024 * 1024, 4 * 1024 * 1024).length).toBe(1);
    expect(chunkPlan(MULTIPART_MIN_PART_BYTES, MULTIPART_MIN_PART_BYTES).length).toBe(1);
    expect(chunkPlan(11 * 1024 * 1024, MULTIPART_MIN_PART_BYTES).length).toBe(3);
    expect(() => chunkPlan(1024, 0)).toThrow(CaptureError);
    expect(() => chunkPlan(1024, -1)).toThrow(CaptureError);
  });

  test('a zero-byte file is still one chunk, so it fails the size check rather than the upload', () => {
    expect(chunkPlan(0).length).toBe(1);
    expect(chunkPlan(0)[0]!.length).toBe(0);
  });

  test('a fractional or negative byte count is not a plan', () => {
    for (const bytes of [-1, 1.5, Number.NaN]) {
      let caught: unknown;
      try {
        chunkPlan(bytes);
      } catch (error) {
        caught = error;
      }
      expect((caught as CaptureError).code).toBe('input_invalid');
    }
  });

  test('hashing fills every chunk from the bytes on disk', () => {
    const body = Buffer.from('x'.repeat(3));
    const plan = hashChunks(body, chunkPlan(3));
    expect(plan[0]!.sha256).toBe(createHash('sha256').update('xxx').digest('hex'));
    // the untouched plan stays a template, so a resume cannot read a stale digest as a verified part
    expect(chunkPlan(3)[0]!.sha256).toBe('unset');
  });
});

describe('object keys', () => {
  test('keys are private, asset-scoped and version-scoped', () => {
    const key = deriveRenditionKey({ assetId: 'ast_017', version: 1, lod: 'lod0', mime: 'model/gltf-binary' });
    expect(key).toBe('private/media/ast_017/v1/lod0.glb');
    expect(deriveRenditionKey({ assetId: 'ast_017', version: 2, lod: 'lod0', mime: 'model/gltf-binary' })).toBe(
      'private/media/ast_017/v2/lod0.glb',
    );
    // poster and turntable strip share a tier, so the suffix is the only thing keeping them apart
    expect(deriveRenditionKey({ assetId: 'ast_017', version: 1, lod: 'poster', mime: 'image/jpeg', suffix: 'turn' })).toBe(
      'private/media/ast_017/v1/poster-turn.jpg',
    );
  });

  test('an unknown mime is refused instead of writing an extension-less key', () => {
    expect(() => extensionFor('application/octet-stream')).toThrow(CaptureError);
    expect(() =>
      deriveRenditionKey({ assetId: 'ast_017', version: 1, lod: 'lod1', mime: 'video/mp4' }),
    ).toThrow(CaptureError);
  });

  test('a public-facing bucket never receives capture evidence', () => {
    expect(() => assertPrivateBucket('nastech-public-media')).toThrow(CaptureError);
    expect(() => assertPrivateBucket('nastech-cdn-origin')).toThrow(CaptureError);
    expect(() => assertPrivateBucket('nastech-capture-private')).not.toThrow();
  });
});

describe('credentials and redaction', () => {
  test('a half-set credential list names exactly what is missing', () => {
    const env = { NASTECH_MEDIA_BUCKET: 'nastech-capture-private' };
    let caught: unknown;
    try {
      readCredentials(env);
    } catch (error) {
      caught = error;
    }
    const error = caught as CaptureError;
    expect(error.code).toBe('bucket_unavailable');
    expect(error.operatorSentence).toInclude('NASTECH_MEDIA_SECRET_ACCESS_KEY');
    expect((error.context.missing as string[]).length).toBe(4);
  });

  test('full credentials are read and the bucket still has to be private', () => {
    const complete = {
      NASTECH_MEDIA_BUCKET_ENDPOINT: 'https://s3.af-south-1.amazonaws.com',
      NASTECH_MEDIA_BUCKET: 'nastech-capture-private',
      NASTECH_MEDIA_BUCKET_REGION: 'af-south-1',
      NASTECH_MEDIA_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
      NASTECH_MEDIA_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    };
    expect(readCredentials(complete).bucket).toBe('nastech-capture-private');
    expect(() => readCredentials({ ...complete, NASTECH_MEDIA_BUCKET: 'nastech-public-cdn' })).toThrow(CaptureError);
  });

  test('no credentials and no client here, so publish cannot claim a bucket', () => {
    let caught: unknown;
    try {
      resolveTransport({ PATH: '/nonexistent-dir' });
    } catch (error) {
      caught = error;
    }
    const error = caught as CaptureError;
    expect(error.code).toBe('bucket_unavailable');
    expect(error.exitCode).toBe(8);
    expect(error.operatorSentence).toInclude('Nothing was uploaded');
    expect(error.operatorSentence).toInclude('aws');
    expect(error.hint).toInclude('--check-only');
  });

  test('a public bucket is a refusal, not a missing-credential message', () => {
    let caught: unknown;
    try {
      resolveTransport({
        PATH: '/nonexistent-dir',
        NASTECH_MEDIA_BUCKET_ENDPOINT: 'https://example',
        NASTECH_MEDIA_BUCKET: 'nastech-public-cdn',
        NASTECH_MEDIA_BUCKET_REGION: 'af-south-1',
        NASTECH_MEDIA_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
        NASTECH_MEDIA_SECRET_ACCESS_KEY: 'secretsecretsecret',
      });
    } catch (error) {
      caught = error;
    }
    expect((caught as CaptureError).code).toBe('input_invalid');
  });

  test('secret values and token shapes never leave in a message', () => {
    const secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    const raw = `put failed for AKIAIOSFODNN7EXAMPLE with ${secret} and -----BEGIN RSA PRIVATE KEY----- plus x-amz-security-token=AAAA1234&more`;
    const out = redact(raw, [secret, 'AKIAIOSFODNN7EXAMPLE']);
    expect(out).not.toInclude(secret);
    expect(out).not.toInclude('AKIAIOSFODNN7EXAMPLE');
    expect(out).not.toInclude('BEGIN RSA PRIVATE KEY');
    expect(out).not.toInclude('AAAA1234');
    expect(out).toInclude('[redacted]');
    // object keys are printed on purpose so the operator can find the object again
    expect(redact('private/media/ast_017/v1/lod0.glb', [secret])).toBe('private/media/ast_017/v1/lod0.glb');
    // short values are not worth scrubbing and would eat ordinary words
    expect(redact('the aws client is missing', ['aws'])).toBe('the aws client is missing');
  });
});

describe('upload with a fake bucket', () => {
  test('honest bytes are accepted and receipted with the digest that was verified', async () => {
    const body = 'watch-lod0-bytes';
    const { dir, pathFor } = workspace({ 'lod0.glb': body });
    try {
      const item = rendition({ bytes: body.length, sha256: `sha256:${digest(body)}` });
      const bucket = fakeBucket();
      const receipts = await uploadRenditions([{ rendition: item, localPath: pathFor('lod0.glb') }], bucket);
      expect(receipts.length).toBe(1);
      expect(receipts[0]).toMatchObject({
        renditionId: item.id,
        bucketKey: item.bucketKey,
        bytes: body.length,
        sha256: `sha256:${digest(body)}`,
        status: 'uploaded',
        chunks: 1,
      });
      expect(bucket.puts).toEqual([item.bucketKey]);
      expect(describeUpload(receipts)).toInclude('uploaded');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('bytes that are not what the manifest described never leave the studio', async () => {
    const { dir, pathFor } = workspace({ 'lod0.glb': 'a different watch entirely' });
    try {
      const item = rendition({ bytes: 'a different watch entirely'.length, sha256: `sha256:${digest('the inspected bytes')}` });
      const bucket = fakeBucket();
      let caught: unknown;
      try {
        await uploadRenditions([{ rendition: item, localPath: pathFor('lod0.glb') }], bucket);
      } catch (error) {
        caught = error;
      }
      const error = caught as CaptureError;
      expect(error.code).toBe('checksum_mismatch');
      expect(error.exitCode).toBe(8);
      // the refusal happens before the transport is touched — no partial object under a published key
      expect(bucket.puts).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a declared size that is not the file size is refused before any put', async () => {
    const body = 'lod0 content';
    const { dir, pathFor } = workspace({ 'lod0.glb': body });
    try {
      const item = rendition({ bytes: body.length + 4096, sha256: `sha256:${digest(body)}` });
      const bucket = fakeBucket();
      let caught: unknown;
      try {
        await uploadRenditions([{ rendition: item, localPath: pathFor('lod0.glb') }], bucket);
      } catch (error) {
        caught = error;
      }
      expect((caught as CaptureError).code).toBe('rendition_size_missing');
      expect(bucket.puts).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a placeholder digest cannot be uploaded against', async () => {
    const { dir, pathFor } = workspace({ 'lod0.glb': 'bytes' });
    try {
      const item = rendition({ bytes: 5, sha256: 'sha256:dev' });
      let caught: unknown;
      try {
        await uploadRenditions([{ rendition: item, localPath: pathFor('lod0.glb') }], fakeBucket());
      } catch (error) {
        caught = error;
      }
      expect((caught as CaptureError).code).toBe('rendition_size_missing');
      expect(() => declaredDigest(item)).toThrow(CaptureError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a missing local file is an honest refusal, not an empty upload', async () => {
    const { dir, pathFor } = workspace({});
    try {
      let caught: unknown;
      try {
        await uploadRenditions([{ rendition: rendition(), localPath: pathFor('absent.glb') }], fakeBucket());
      } catch (error) {
        caught = error;
      }
      expect((caught as CaptureError).code).toBe('input_invalid');
      expect((caught as CaptureError).operatorSentence).toInclude('absent.glb');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an empty target list is refused rather than reported as a finished upload', async () => {
    let caught: unknown;
    try {
      await uploadRenditions([], fakeBucket());
    } catch (error) {
      caught = error;
    }
    expect((caught as CaptureError).code).toBe('input_invalid');
  });

  test('re-running an upload is idempotent: same bytes at the same key is already_present', async () => {
    const body = 'watch geometry bytes';
    const { dir, pathFor } = workspace({ 'lod0.glb': body });
    try {
      const item = rendition({ bytes: body.length, sha256: `sha256:${digest(body)}` });
      const bucket = fakeBucket({ existing: { [item.bucketKey]: { bytes: body.length, sha256: digest(body) } } });
      const receipts = await uploadRenditions([{ rendition: item, localPath: pathFor('lod0.glb') }], bucket);
      expect(receipts[0]!.status).toBe('already_present');
      expect(bucket.puts).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a key that already holds different bytes is a collision, not an overwrite', async () => {
    const body = 'the captured watch';
    const { dir, pathFor } = workspace({ 'lod0.glb': body });
    try {
      const item = rendition({ bytes: body.length, sha256: `sha256:${digest(body)}` });
      const bucket = fakeBucket({ existing: { [item.bucketKey]: { bytes: 99, sha256: digest('some other item') } } });
      let caught: unknown;
      try {
        await uploadRenditions([{ rendition: item, localPath: pathFor('lod0.glb') }], bucket);
      } catch (error) {
        caught = error;
      }
      const error = caught as CaptureError;
      expect(error.code).toBe('checksum_mismatch');
      // the stored object is what a dispute reader would have seen, so it is named in the refusal
      expect(error.operatorSentence).toInclude(item.bucketKey);
      expect(bucket.puts).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a backend that cannot report a checksum is still verified against the local digest', async () => {
    const body = 'no checksum backend';
    const { dir, pathFor } = workspace({ 'lod0.glb': body });
    try {
      const item = rendition({ bytes: body.length, sha256: `sha256:${digest(body)}` });
      const receipts = await uploadRenditions([{ rendition: item, localPath: pathFor('lod0.glb') }], fakeBucket({ stored: (_key, bytes) => ({ bytes, sha256: null }) }));
      expect(receipts[0]!.status).toBe('uploaded');
      expect(receipts[0]!.sha256).toBe(`sha256:${digest(body)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a bucket that accepts fewer bytes than sent is not an upload', async () => {
    const body = 'truncated by the backend';
    const { dir, pathFor } = workspace({ 'lod0.glb': body });
    try {
      const item = rendition({ bytes: body.length, sha256: `sha256:${digest(body)}` });
      const bucket = fakeBucket({ stored: () => ({ bytes: 12, sha256: digest(body) }) });
      let caught: unknown;
      try {
        await uploadRenditions([{ rendition: item, localPath: pathFor('lod0.glb') }], bucket);
      } catch (error) {
        caught = error;
      }
      expect((caught as CaptureError).code).toBe('rendition_size_missing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a bucket that stores different bytes than it was given is caught after the put', async () => {
    const body = 'honest local bytes';
    const { dir, pathFor } = workspace({ 'lod0.glb': body });
    try {
      const item = rendition({ bytes: body.length, sha256: `sha256:${digest(body)}` });
      const bucket = fakeBucket({ stored: (_key, bytes) => ({ bytes, sha256: digest('mutated in transit') }) });
      let caught: unknown;
      try {
        await uploadRenditions([{ rendition: item, localPath: pathFor('lod0.glb') }], bucket);
      } catch (error) {
        caught = error;
      }
      expect((caught as CaptureError).code).toBe('checksum_mismatch');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('every rendition of a re-shot asset moves under the new version, never over the old one', async () => {
    const v1Body = 'first capture';
    const v2Body = 're-shoot, different watch lighting';
    const { dir, pathFor } = workspace({ v1: v1Body, v2: v2Body });
    try {
      const key = (version: number, lod: LodTier): string => deriveRenditionKey({ assetId: 'ast_017', version, lod, mime: 'model/gltf-binary' });
      const r1 = rendition({ id: 'ren_ast_017_v1_lod0', bytes: v1Body.length, sha256: `sha256:${digest(v1Body)}`, bucketKey: key(1, 'lod0') });
      const r2 = rendition({ id: 'ren_ast_017_v2_lod0', bytes: v2Body.length, sha256: `sha256:${digest(v2Body)}`, bucketKey: key(2, 'lod0') });
      const bucket = fakeBucket({ existing: { [r1.bucketKey]: { bytes: v1Body.length, sha256: digest(v1Body) } } });
      const receipts: readonly UploadReceipt[] = await uploadRenditions(
        [
          { rendition: r1, localPath: pathFor('v1') },
          { rendition: r2, localPath: pathFor('v2') },
        ],
        bucket,
      );
      expect(receipts.map((r) => r.status)).toEqual(['already_present', 'uploaded']);
      expect(bucket.puts).toEqual([r2.bucketKey]);
      expect(r1.bucketKey).not.toBe(r2.bucketKey);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
