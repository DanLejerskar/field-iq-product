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
  presignGet(key: string, expiresInSeconds?: number): Promise<string>;
}

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function photoKey(orgId: string, sessionId: string, stepNumber: number): string {
  return `${orgId}/${sessionId}/${stepNumber}-${randomUUID()}.jpg`;
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

  presignGet(key: string, expiresInSeconds = 300): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }
}
