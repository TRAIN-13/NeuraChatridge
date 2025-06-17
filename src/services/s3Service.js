import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import logger from '../utils/logger.js';

// Load AWS configuration from environment variables
const {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_DEFAULT_REGION,
  AWS_BUCKET,
  AWS_USE_PATH_STYLE_ENDPOINT = "false",
  S3_MAX_RETRIES = "3",
  S3_REQUEST_TIMEOUT = "10000"
} = process.env;

if (
  !AWS_ACCESS_KEY_ID ||
  !AWS_SECRET_ACCESS_KEY ||
  !AWS_DEFAULT_REGION ||
  !AWS_BUCKET
) {
  throw new Error(
    "Missing AWS configuration variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION, AWS_BUCKET"
  );
}

const maxRetries = parseInt(S3_MAX_RETRIES, 10);
const requestTimeout = parseInt(S3_REQUEST_TIMEOUT, 10);
const usePathStyle = AWS_USE_PATH_STYLE_ENDPOINT.toLowerCase() === "true";

// Initialize S3 client
const s3Client = new S3Client({
  region: AWS_DEFAULT_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY
  },
  forcePathStyle: usePathStyle
});

/**
 * TimeoutError indicates an S3 operation exceeded configured timeout
 */
export class TimeoutError extends Error {
  constructor(message = 'S3 request timed out') {
    super(message);
    this.name = 'TimeoutError';
    this.statusCode = 504;
  }
}

/**
 * S3UploadError indicates failure to upload after retries
 */
export class S3UploadError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'S3Error';
    this.statusCode = 502;
    this.originalError = originalError;
  }
}

// Helper: wrap a promise with a timeout
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new TimeoutError()), ms)
    )
  ]);
}

/**
 * Uploads a file buffer to S3 under "ai/images/" with a generated UUID filename
 * and forced .jpg extension, returning its public URL and the S3 key.
 *
 * @param {Buffer|Uint8Array|Blob} buffer - The raw file data.
 * @returns {Promise<{ url: string, key: string }>}
 * @throws {TimeoutError} if the upload times out
 * @throws {S3UploadError} if all retry attempts fail
 */
export async function uploadFile(buffer) {
  const ext = 'jpg';
  const contentType = 'image/jpeg';

  const filename = `${uuidv4()}.${ext}`;
  const key = `ai/images/${filename}`;

  const params = {
    Bucket: AWS_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType
  };

  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await withTimeout(
        s3Client.send(new PutObjectCommand(params)),
        requestTimeout
      );

      // Build public URL with correct style
      const url = usePathStyle
        ? `https://s3.${AWS_DEFAULT_REGION}.amazonaws.com/${AWS_BUCKET}/${key}`
        : `https://${AWS_BUCKET}.s3.${AWS_DEFAULT_REGION}.amazonaws.com/${key}`;

      logger.info('S3 upload succeeded', { key, url, attempt });
      return { url, key };
    } catch (err) {
      lastError = err;
      logger.warn(`S3 upload attempt ${attempt} failed`, { error: err.message });
      if (attempt < maxRetries) {
        // Exponential backoff
        await new Promise((res) => setTimeout(res, attempt * 1000));
      }
    }
  }

  throw new S3UploadError(
    `Failed to upload file to S3 after ${maxRetries} attempts`,
    lastError
  );
}
