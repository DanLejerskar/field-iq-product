/** S3 helpers for the reporter — upload the rendered PDF and presign step photos. */
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function getClient(): S3Client {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'field_iq',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'field_iq_dev',
    },
  });
}

const BUCKET = process.env.S3_BUCKET ?? 'field-iq';

export async function uploadPdf(sessionId: string, body: Buffer): Promise<string> {
  const key = `reports/${sessionId}.pdf`;
  await getClient().send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: 'application/pdf' }),
  );
  return key;
}

export async function presignGet(key: string, expiresInSeconds = 60 * 60): Promise<string> {
  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}
