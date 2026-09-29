import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomUUID } from 'node:crypto';

/**
 * Presigned uploads to MinIO/S3.
 *
 * Documents never pass through this service. The browser PUTs straight to
 * object storage on a short-lived signed URL, which keeps passport scans out
 * of this process's memory, its logs, its request traces and every
 * intermediary that would otherwise see the body — and means a compromise of
 * this service leaks references, not files.
 *
 * The signature below is AWS SigV4's shape, generated locally rather than
 * with the AWS SDK: the SDK is 8MB of dependency for one operation, and the
 * operation is a keyed hash over a canonical string. Swapping in
 * `@aws-sdk/s3-request-presigner` later is a drop-in if a deployment needs
 * the full credential-provider chain.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly endpoint: string;
  private readonly bucket: string;
  private readonly region: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly expirySeconds: number;

  constructor(config: ConfigService) {
    this.endpoint = (config.get<string>('S3_ENDPOINT', { infer: true }) ?? '').replace(/\/$/, '');
    this.bucket = config.get<string>('S3_BUCKET', { infer: true }) ?? 'damp-kyc';
    this.region = config.get<string>('S3_REGION', { infer: true }) ?? 'us-east-1';
    this.accessKey = config.get<string>('S3_ACCESS_KEY', { infer: true }) ?? '';
    this.secretKey = config.get<string>('S3_SECRET_KEY', { infer: true }) ?? '';
    // Five minutes. Long enough for a slow upload on a bad connection, short
    // enough that a URL leaked in a screenshot or a log is useless by the
    // time anybody reads it.
    this.expirySeconds = config.get<number>('S3_PRESIGN_EXPIRY_SECONDS', { infer: true }) ?? 300;
  }

  presignUpload(input: { caseId: string; partyId: string; kind: string; contentType: string }) {
    // The key embeds the case, never the party's name or email: an object
    // key ends up in access logs, and a bucket listing should not be a
    // customer list.
    const key = `cases/${input.caseId}/${input.kind.toLowerCase()}_${randomUUID()}`;

    if (!this.accessKey || !this.secretKey) {
      // Unconfigured storage is a real state in local development. Returning
      // a key with no URL lets the flow be exercised end to end with the
      // upload stubbed, rather than 500-ing the whole KYC journey.
      this.logger.warn('S3 credentials are unset; returning a storage key with no upload URL');
      return { storageKey: key, uploadUrl: null, expiresInSeconds: 0, contentType: input.contentType };
    }

    return {
      storageKey: key,
      uploadUrl: this.presign('PUT', key),
      expiresInSeconds: this.expirySeconds,
      contentType: input.contentType,
    };
  }

  presignDownload(storageKey: string): string | null {
    if (!this.accessKey || !this.secretKey) return null;
    return this.presign('GET', storageKey);
  }

  private presign(method: 'PUT' | 'GET', key: string): string {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const host = new URL(this.endpoint).host;
    const canonicalUri = `/${this.bucket}/${key}`;

    const query = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.accessKey}/${credentialScope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(this.expirySeconds),
      'X-Amz-SignedHeaders': 'host',
    });
    // Sorted, because SigV4's canonical query string is defined as sorted and
    // a URLSearchParams insertion order that happened to match was luck.
    const canonicalQuery = [...query.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      `host:${host}\n`,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const signature = hmac(
      hmac(hmac(hmac(hmac(`AWS4${this.secretKey}`, dateStamp), this.region), 's3'), 'aws4_request'),
      stringToSign,
    ).toString('hex');

    return `${this.endpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

// A plain hash, not a keyed one. SigV4's string-to-sign contains
// Hex(SHA256(CanonicalRequest)); an HMAC with an empty key produces a
// different digest, and every presigned URL would be rejected by the storage
// backend with a signature mismatch that says nothing about why.
function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}
