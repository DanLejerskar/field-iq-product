/**
 * Object storage behind a StorageAdapter interface so S3 / R2 / MinIO are swappable.
 * Photos live at field-iq/<org>/<session>/<step>-<uuid>.jpg (02_Architecture.md §3.3.3).
 */
import { createHash, randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/env.js';

export interface StorageAdapter {
  putPhoto(
    orgId: string,
    sessionId: string,
    stepNumber: number,
    bytes: Buffer,
  ): Promise<{ key: string; sha256: string }>;
  /** Generic blob put by key (ported from Yogi's bridge — used to copy Genesis exemplars). */
  putObject(key: string, bytes: Buffer, contentType: string): Promise<{ key: string; sha256: string }>;
  presignGet(key: string, expiresInSeconds?: number): Promise<string>;
}

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function photoKey(orgId: string, sessionId: string, stepNumber: number): string {
  return `${orgId}/${sessionId}/${stepNumber}-${randomUUID()}.jpg`;
}

/** Storage key for a Genesis exemplar copied into Field IQ storage (ported from Yogi's bridge). */
export function exemplarKey(
  genesisProcedureId: string,
  sourceVersion: number,
  stepNumber: number,
  angle: string,
): string {
  return `exemplars/${genesisProcedureId}/v${sourceVersion}/step-${stepNumber}-${angle}-${randomUUID()}.png`;
}

export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;

  constructor() {
    this.client = new S3Client({
      endpoint: config.s3.endpoint,
      region: config.s3.region,
      forcePathStyle: config.s3.forcePathStyle,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
    });
  }

  async putPhoto(
    orgId: string,
    sessionId: string,
    stepNumber: number,
    bytes: Buffer,
  ): Promise<{ key: string; sha256: string }> {
    const key = photoKey(orgId, sessionId, stepNumber);
    await this.client.send(
      new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
        Body: bytes,
        ContentType: 'image/jpeg',
      }),
    );
    return { key, sha256: sha256Hex(bytes) };
  }

  async putObject(
    key: string,
    bytes: Buffer,
    contentType: string,
  ): Promise<{ key: string; sha256: string }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
    return { key, sha256: sha256Hex(bytes) };
  }

  presignGet(key: string, expiresInSeconds = 300): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }
}

/**
 * Phase 2B default: store the photo as a `data:image/jpeg;base64,...` URI
 * directly in `audit_log.photo_url`. Skips S3/R2 entirely while we're on
 * Railway. The verifier already branches on the `data:` prefix.
 *
 * TODO(2c): swap back to S3StorageAdapter once Cloudflare R2 is wired.
 */
export class DataUriStorageAdapter implements StorageAdapter {
  async putPhoto(
    _orgId: string,
    _sessionId: string,
    _stepNumber: number,
    bytes: Buffer,
  ): Promise<{ key: string; sha256: string }> {
    const dataUri = `data:image/jpeg;base64,${bytes.toString('base64')}`;
    return { key: dataUri, sha256: sha256Hex(bytes) };
  }

  async putObject(
    _key: string,
    bytes: Buffer,
    contentType: string,
  ): Promise<{ key: string; sha256: string }> {
    const dataUri = `data:${contentType};base64,${bytes.toString('base64')}`;
    return { key: dataUri, sha256: sha256Hex(bytes) };
  }

  async presignGet(key: string): Promise<string> {
    // Data URIs are already self-contained — no presign needed; the dashboard
    // can stick them in <img src=...> directly.
    return key;
  }
}

/** Pick the right adapter based on whether S3 is configured. */
export function makeStorageAdapter(): StorageAdapter {
  return config.s3.enabled ? new S3StorageAdapter() : new DataUriStorageAdapter();
}
