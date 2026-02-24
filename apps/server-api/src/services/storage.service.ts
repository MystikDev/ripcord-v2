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

/** Internal endpoint — used by the server to talk to MinIO directly. */
const internalEndpoint = `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`;

/** Public endpoint — used in presigned URLs that the desktop client fetches from.
 *  Falls back to the internal endpoint for local dev (both are localhost). */
const publicEndpoint = env.MINIO_PUBLIC_URL ?? internalEndpoint;

const s3Opts = {
  region: 'us-east-1',
  credentials: {
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
  },
  forcePathStyle: true, // Required for MinIO
};

/** Server-side operations (bucket management, direct uploads). */
const s3 = new S3Client({ ...s3Opts, endpoint: internalEndpoint });

/** Presigned URL generation — uses the public endpoint so clients can reach MinIO. */
const s3Public = publicEndpoint === internalEndpoint
  ? s3 // same client when no public URL is configured (local dev)
  : new S3Client({ ...s3Opts, endpoint: publicEndpoint });

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

  // Configure CORS so the browser can PUT directly to presigned URLs.
  // Include Tauri desktop origins and explicit CORS_ALLOWED_ORIGINS.
  try {
    const origins = [
      ...env.CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
      'https://tauri.localhost',
      'tauri://localhost',
      'http://localhost:*',
    ];
    // Deduplicate
    const uniqueOrigins = [...new Set(origins)];

    await s3.send(
      new PutBucketCorsCommand({
        Bucket: BUCKET,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: uniqueOrigins,
              AllowedMethods: ['GET', 'PUT', 'HEAD'],
              AllowedHeaders: ['*'],
              ExposeHeaders: ['ETag'],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
    logger.info({ bucket: BUCKET, origins: uniqueOrigins }, 'S3 bucket CORS configured');
  } catch (err) {
    logger.warn({ err, bucket: BUCKET }, 'Failed to set S3 bucket CORS');
  }
}

/** Generate a pre-signed PUT URL for uploading an encrypted file (uses public endpoint). */
export async function getUploadUrl(storageKey: string, contentLength?: number): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ...(contentLength ? { ContentLength: contentLength } : {}),
  });
  return getSignedUrl(s3Public, command, { expiresIn: PRESIGN_EXPIRES_SEC });
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

/** Generate a pre-signed GET URL for downloading an encrypted file (uses public endpoint). */
export async function getDownloadUrl(storageKey: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  });
  return getSignedUrl(s3Public, command, { expiresIn: PRESIGN_EXPIRES_SEC });
}
