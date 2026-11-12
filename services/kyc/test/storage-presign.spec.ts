import { StorageService } from '../src/storage/storage.service';

const NOW = new Date('2026-11-12T08:30:15.123Z');

const config = (overrides: Record<string, unknown> = {}) => {
  const values: Record<string, unknown> = {
    S3_ENDPOINT: 'http://localhost:59000/',
    S3_BUCKET: 'damp-kyc',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY: 'AKIDEXAMPLE',
    S3_SECRET_KEY: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    S3_PRESIGN_EXPIRY_SECONDS: 300,
    ...overrides,
  };
  return { get: (k: string) => values[k] } as never;
};

const input = { caseId: 'case-1', partyId: 'party-1', kind: 'PASSPORT', contentType: 'image/jpeg' };

describe('StorageService presigning', () => {
  // Only Date is faked: the SDK's middleware stack runs on promises, and
  // faking the timers under it would hang the presign rather than pin it.
  beforeEach(() => {
    jest.useFakeTimers({
      now: NOW,
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance'],
    });
  });
  afterEach(() => jest.useRealTimers());

  it('signs a path-style PUT on the configured endpoint, bucket, region and expiry', async () => {
    const out = await new StorageService(config()).presignUpload(input);
    expect(out.storageKey).toMatch(/^cases\/case-1\/passport_[0-9a-f-]{36}$/);
    expect(out.expiresInSeconds).toBe(300);
    expect(out.contentType).toBe('image/jpeg');

    const url = new URL(out.uploadUrl!);
    // Path-style: the bucket is in the path, never the hostname.
    expect(url.origin).toBe('http://localhost:59000');
    expect(url.pathname).toBe(`/damp-kyc/${out.storageKey}`);

    const q = url.searchParams;
    expect(q.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(q.get('X-Amz-Credential')).toBe('AKIDEXAMPLE/20261112/us-east-1/s3/aws4_request');
    expect(q.get('X-Amz-Date')).toBe('20261112T083015Z');
    expect(q.get('X-Amz-Expires')).toBe('300');
    // The content type is bound into the signature, so the backend refuses
    // an upload that sends any other one.
    expect(q.get('X-Amz-SignedHeaders')).toBe('content-type;host');
    expect(q.get('X-Amz-Content-Sha256')).toBe('UNSIGNED-PAYLOAD');
    expect(q.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    // A checksum of an empty body here would fail every real upload.
    expect([...q.keys()].filter((k) => /checksum/i.test(k))).toEqual([]);
  });

  it('honours a configured region and expiry', async () => {
    const out = await new StorageService(config({ S3_REGION: 'eu-west-1', S3_PRESIGN_EXPIRY_SECONDS: 60 })).presignUpload(input);
    const q = new URL(out.uploadUrl!).searchParams;
    expect(q.get('X-Amz-Credential')).toBe('AKIDEXAMPLE/20261112/eu-west-1/s3/aws4_request');
    expect(q.get('X-Amz-Expires')).toBe('60');
    expect(out.expiresInSeconds).toBe(60);
  });

  it('is deterministic for a fixed clock, key and credentials, and keyed on the secret', async () => {
    const key = 'cases/case-1/passport_00000000-0000-0000-0000-000000000000';
    const a = await new StorageService(config()).presignDownload(key);
    const b = await new StorageService(config()).presignDownload(key);
    const c = await new StorageService(config({ S3_SECRET_KEY: 'other' })).presignDownload(key);
    expect(a).toBe(b);
    const sig = (u: string | null) => new URL(u!).searchParams.get('X-Amz-Signature');
    expect(sig(c)).not.toBe(sig(a));
    expect(new URL(a!).pathname).toBe(`/damp-kyc/${key}`);
  });

  it('returns a key with no URL when credentials are unset', async () => {
    const svc = new StorageService(config({ S3_ACCESS_KEY: '', S3_SECRET_KEY: '' }));
    const out = await svc.presignUpload(input);
    expect(out.uploadUrl).toBeNull();
    expect(out.expiresInSeconds).toBe(0);
    expect(out.storageKey).toMatch(/^cases\/case-1\/passport_/);
    expect(await svc.presignDownload(out.storageKey)).toBeNull();
  });
});
