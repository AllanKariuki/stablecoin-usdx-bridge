import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

/**
 * Presigned uploads to MinIO/S3.
 *
 * Documents never pass through this service. The browser PUTs straight to
 * object storage on a short-lived signed URL, which keeps passport scans out
 * of this process's memory, its logs, its request traces and every
 * intermediary that would otherwise see the body — and means a compromise of
 * this service leaks references, not files.
 *
 * Signing is the AWS SDK's, not ours. An earlier version hand-rolled SigV4;
 * it worked, but every canonicalisation rule it got right was one more thing
 * to keep right, and a signature mismatch from the backend says nothing
 * about which rule broke.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;
  private readonly expirySeconds: number;
  // Null when credentials are unset. Presigning is offline — no request
  // leaves this process — so the client never actually talks to the bucket.
  private readonly s3: S3Client | null;

  constructor(config: ConfigService) {
    const endpoint = (config.get<string>('S3_ENDPOINT', { infer: true }) ?? '').replace(/\/$/, '');
    const accessKeyId = config.get<string>('S3_ACCESS_KEY', { infer: true }) ?? '';
    const secretAccessKey = config.get<string>('S3_SECRET_KEY', { infer: true }) ?? '';
    this.bucket = config.get<string>('S3_BUCKET', { infer: true }) ?? 'damp-kyc';
    // Five minutes. Long enough for a slow upload on a bad connection, short
    // enough that a URL leaked in a screenshot or a log is useless by the
    // time anybody reads it.
    this.expirySeconds = config.get<number>('S3_PRESIGN_EXPIRY_SECONDS', { infer: true }) ?? 300;

    this.s3 =
      accessKeyId && secretAccessKey
        ? new S3Client({
            endpoint: endpoint || undefined,
            region: config.get<string>('S3_REGION', { infer: true }) ?? 'us-east-1',
            credentials: { accessKeyId, secretAccessKey },
            // Path-style (`host/bucket/key`), as before: MinIO has no
            // per-bucket DNS, and virtual-hosted style would point the
            // browser at `damp-kyc.localhost`.
            forcePathStyle: true,
            // The SDK otherwise bakes a CRC32 of an *empty* body into every
            // presigned PUT. MinIO ignores it; S3 checks the real upload
            // against it and rejects every non-empty file.
            requestChecksumCalculation: 'WHEN_REQUIRED',
          })
        : null;
  }

  async presignUpload(input: { caseId: string; partyId: string; kind: string; contentType: string }) {
    // The key embeds the case, never the party's name or email: an object
    // key ends up in access logs, and a bucket listing should not be a
    // customer list.
    const key = `cases/${input.caseId}/${input.kind.toLowerCase()}_${randomUUID()}`;

    if (!this.s3) {
      // Unconfigured storage is a real state in local development. Returning
      // a key with no URL lets the flow be exercised end to end with the
      // upload stubbed, rather than 500-ing the whole KYC journey.
      this.logger.warn('S3 credentials are unset; returning a storage key with no upload URL');
      return { storageKey: key, uploadUrl: null, expiresInSeconds: 0, contentType: input.contentType };
    }

    // ContentType is deliberately not on the command: it would join `host`
    // in SignedHeaders, and only `host` was ever signed. Binding it changes
    // what the browser must send, which is its own change, not this swap.
    const uploadUrl = await getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: this.expirySeconds,
    });
    return { storageKey: key, uploadUrl, expiresInSeconds: this.expirySeconds, contentType: input.contentType };
  }

  async presignDownload(storageKey: string): Promise<string | null> {
    if (!this.s3) return null;
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }), {
      expiresIn: this.expirySeconds,
    });
  }
}
