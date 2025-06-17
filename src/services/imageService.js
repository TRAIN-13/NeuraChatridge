import Queue from 'bull';
import sharp from 'sharp';
import { validateImage, ValidationError } from '../utils/validation.js';
import { uploadFile } from './s3Service.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

// Redis configuration for Bull queue
const redisConfig = {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
  password: process.env.REDIS_PASSWORD || undefined,
};

// Initialize Bull queue for image uploads
export const imageUploadQueue = new Queue('image-upload', {
  redis: redisConfig,
});

// Custom error class for image processing errors
class ProcessingError extends Error {
  constructor(code, originalError) {
    super(originalError.message || 'Image processing error');
    this.name = 'ProcessingError';
    this.code = code;
    this.originalError = originalError;
    this.statusCode = 500; // Default to 500 for processing errors
  }
}

/**
 * Validate, compress and enqueue an image upload job to be processed in the background.
 * @param {Buffer|Uint8Array} buffer   - Raw image data
 * @param {string} filename             - Original filename (for reference)
 * @param {string} mimetype             - Original MIME type of the image
 */
export async function enqueueImageUpload(buffer, filename, mimetype) {
  // First, validate the image
  try {
    validateImage(buffer, mimetype);
  } catch (err) {
    // Log validation errors
    logger.error('Image validation failed', {
      filename,
      mimetype,
      size: buffer?.length || 0,
      error: err.message,
      details: err.details || {}
    });

    // Preserve validation errors, wrap others
    if (err instanceof ValidationError) {
      throw err;
    }
    throw new ProcessingError('IMAGE_VALIDATION_FAILED', err);
  }

  try {
    // Process image with sharp
    const processedBuffer = await sharp(buffer)
      .rotate()
      .jpeg({ quality: 80 })
      .toBuffer()
      .catch(err => {
        throw new ProcessingError('SHARP_PROCESSING_ERROR', err);
      });

    // Generate a unique job ID for tracking
    const jobId = `img-${uuidv4()}`;

    // Prepare payload with all necessary data
    const payload = {
      jobId,
      buffer: processedBuffer,
      filename,
      mimetype: 'image/jpeg',
    };

    // Get concurrency from environment or default to 5
    const concurrency = parseInt(process.env.IMAGE_QUEUE_CONCURRENCY || '5', 10);
    
    // Add job to the queue
    await imageUploadQueue.add(
      payload,
      {
        jobId, // Use our custom job ID for better tracking
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      }
    );

    logger.info('Image enqueued for processing', {
      filename,
      jobId,
      size: processedBuffer.length
    });

    return jobId;
  } catch (err) {
    logger.error('Image processing failed', {
      filename,
      error: err.message,
      stack: err.stack
    });
    throw new ProcessingError('IMAGE_PROCESSING_FAILED', err);
  }
}

// Get concurrency from environment or default to 5
const concurrency = parseInt(process.env.IMAGE_QUEUE_CONCURRENCY || '5', 10);

// Worker: process image upload jobs and upload to S3
imageUploadQueue.process(concurrency, async (job) => {
  const startTime = Date.now();
  const { jobId, buffer, filename } = job.data;
  
  // Enhanced logging context
  const logContext = {
    jobId,
    filename,
    queue: 'image-upload'
  };

  logger.debug('Starting image upload processing', logContext);

  try {
    // Upload directly to S3 using the buffer
    const { url, key } = await uploadFile(buffer);
    const duration = Date.now() - startTime;
    
    logger.info('Image upload succeeded', { 
      ...logContext, 
      url, 
      key,
      size: buffer.length,
      duration
    });
    
    return { url, key, jobId };
  } catch (err) {
    logger.error('Image upload failed', { 
      ...logContext,
      error: err.message,
      stack: err.stack,
      attempt: job.attemptsMade + 1
    });
    
    // Wrap S3 error in ProcessingError
    throw new ProcessingError('S3_UPLOAD_FAILED', err);
  }
});

// Log failures after all retry attempts
imageUploadQueue.on('failed', (job, err) => {
  const jobInfo = {
    jobId: job.id,
    customJobId: job.data.jobId,
    filename: job.data.filename,
    attempts: job.attemptsMade,
    error: err.message
  };
  
  logger.warn(`Job ${job.id} failed after ${job.attemptsMade} attempts`, jobInfo);
});

// Graceful shutdown handling
const shutdown = async (signal) => {
  logger.info(`Received ${signal}, closing queue...`);
  
  try {
    // Wait for active jobs to finish (with timeout)
    await Promise.race([
      imageUploadQueue.close(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Queue shutdown timeout')), 10000))
    ]);
    
    logger.info('Queue closed gracefully');
    process.exit(0);
  } catch (err) {
    logger.error('Error during queue shutdown', {
      error: err.message,
      stack: err.stack
    });
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default imageUploadQueue;