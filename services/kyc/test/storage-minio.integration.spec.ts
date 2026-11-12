import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash, randomUUID } from 'node:crypto';
import { StorageService } from '../src/storage/storage.service';

// Opt-in, the same way core-ledger's integration tests take
// LEDGER_TEST_DATABASE_URL: set it to a reachable MinIO and the suite runs,
// leave it unset and it skips. Locally:
//
//   docker compose up -d minio      (or `make test-node`, which does this)
//   KYC_TEST_S3_ENDPOINT=http://localhost:59000 pnpm --filter @damp/kyc test
//
// The unit spec pins the URL's shape; only a real backend can say the
// signature is one it accepts.
const ENDPOINT = process.env.KYC_TEST_S3_ENDPOINT;
const ACCESS_KEY = process.env.KYC_TEST_S3_ACCESS_KEY ?? 'minioadmin';
const SECRET_KEY = process.env.KYC_TEST_S3_SECRET_KEY ?? 'minioadmin';
const REGION = 'us-east-1';

(ENDPOINT ? describe : describe.skip)('StorageService against MinIO', () => {
  // A bucket per run, so a failed run leaves nothing a later one trips on
  // and the dev `damp-kyc` bucket is never touched.
  const bucket = `kyc-it-${randomUUID()}`;
  const admin = new S3Client({
    endpoint: ENDPOINT,
    region: REGION,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    forcePathStyle: true,
  });
  const storage = new StorageService({
    get: (k: string) =>
      ({
        S3_ENDPOINT: ENDPOINT,
        S3_BUCKET: bucket,
        S3_REGION: REGION,
        S3_ACCESS_KEY: ACCESS_KEY,
        S3_SECRET_KEY: SECRET_KEY,
        S3_PRESIGN_EXPIRY_SECONDS: 60,
      })[k],
  } as never);
  const keys: string[] = [];

  beforeAll(async () => {
    await admin.send(new CreateBucketCommand({ Bucket: bucket }));
  });

  afterAll(async () => {
    for (const Key of keys) await admin.send(new DeleteObjectCommand({ Bucket: bucket, Key }));
    await admin.send(new DeleteBucketCommand({ Bucket: bucket }));
    admin.destroy();
  });

  it('accepts a PUT on the presigned URL and serves the same bytes back on a presigned GET', async () => {
    const body = Buffer.from(`not really a passport ${randomUUID()}`);
    const slot = await storage.presignUpload({ caseId: 'case-it', partyId: 'party-it', kind: 'PASSPORT', contentType: 'image/jpeg' });
    keys.push(slot.storageKey);

    // What the browser does: a bare PUT with the content type it was told to send.
    const put = await fetch(slot.uploadUrl!, { method: 'PUT', body, headers: { 'content-type': slot.contentType } });
    expect(put.status).toBe(200);

    const get = await fetch((await storage.presignDownload(slot.storageKey))!);
    expect(get.status).toBe(200);
    expect(get.headers.get('content-type')).toBe('image/jpeg');
    const got = Buffer.from(await get.arrayBuffer());
    expect(createHash('sha256').update(got).digest('hex')).toBe(createHash('sha256').update(body).digest('hex'));
  });

  it('rejects a URL signed with the wrong secret', async () => {
    const forged = new StorageService({
      get: (k: string) =>
        ({ S3_ENDPOINT: ENDPOINT, S3_BUCKET: bucket, S3_REGION: REGION, S3_ACCESS_KEY: ACCESS_KEY, S3_SECRET_KEY: 'wrong' })[k],
    } as never);
    const slot = await forged.presignUpload({ caseId: 'case-it', partyId: 'party-it', kind: 'PASSPORT', contentType: 'image/jpeg' });
    // The right content type, so the only thing wrong is the secret.
    const put = await fetch(slot.uploadUrl!, { method: 'PUT', body: 'x', headers: { 'content-type': slot.contentType } });
    expect(put.status).toBe(403);
  });

  it('rejects an upload whose Content-Type differs from the one the slot was issued for', async () => {
    const slot = await storage.presignUpload({ caseId: 'case-it', partyId: 'party-it', kind: 'PASSPORT', contentType: 'image/jpeg' });
    // Cleaned up regardless, so a regression fails this test and not afterAll.
    keys.push(slot.storageKey);

    const put = await fetch(slot.uploadUrl!, { method: 'PUT', body: '<html></html>', headers: { 'content-type': 'text/html' } });
    expect(put.status).toBe(403);
    // And nothing was stored under the key.
    const get = await fetch((await storage.presignDownload(slot.storageKey))!);
    expect(get.status).toBe(404);
  });
});
