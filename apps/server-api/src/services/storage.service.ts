import { Readable } from 'node:stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@ripcord/config';
import { logger } from '../logger.js';

const BUCKET = 'ripcord-attachments';
const PRESIGN_EXPIRES_SEC = 3600; // 1 hour

const s3 = new S3Client({
  endpoint: `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
  },
  forcePathStyle: true, // Required for MinIO
});

/** Ensure the bucket exists and CORS is configured on startup. */
export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    logger.info({ bucket: BUCKET }, 'S3 bucket exists');
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
      logger.info({ bucket: BUCKET }, 'S3 bucket created');
    } catch (err) {
      logger.error({ err, bucket: BUCKET }, 'Failed to create S3 bucket');
      throw err;
    }
  }

  // Configure CORS so the browser can PUT directly to presigned URLs
  try {
    await s3.send(
      new PutBucketCorsCommand({
        Bucket: BUCKET,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: env.CORS_ALLOWED_ORIGINS.split(',').map((s) =>
                s.trim(),
              ),
              AllowedMethods: ['GET', 'PUT', 'HEAD'],
              AllowedHeaders: ['*'],
              ExposeHeaders: ['ETag'],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
    logger.info({ bucket: BUCKET }, 'S3 bucket CORS configured');
  } catch (err) {
    logger.warn({ err, bucket: BUCKET }, 'Failed to set S3 bucket CORS');
  }
}

/** Generate a pre-signed PUT URL for uploading an encrypted file. */
export async function getUploadUrl(storageKey: string, contentLength?: number): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ...(contentLength ? { ContentLength: contentLength } : {}),
  });
  return getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRES_SEC });
}

/** Upload a buffer directly to S3/MinIO (server-side). */
export async function uploadDirect(
  storageKey: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Fetch an object from S3/MinIO as a readable stream (server-side proxy). */
export async function getObject(storageKey: string): Promise<{
  body: Readable;
  contentType: string | undefined;
  contentLength: number | undefined;
}> {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: storageKey }),
  );
  return {
    body: response.Body as Readable,
    contentType: response.ContentType,
    contentLength: response.ContentLength,
  };
}

/** Generate a pre-signed GET URL for downloading an encrypted file. */
export async function getDownloadUrl(storageKey: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  });
  return getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRES_SEC });
}
