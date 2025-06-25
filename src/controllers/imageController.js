// src/controllers/imageController.js
import logger from '../utils/logger.js';
import { ValidationError } from '../utils/validation.js';
import { enqueueImageUpload } from '../services/imageService.js';

/**
 * Express handler to initiate image upload.
 * Validates request and enqueues upload job for asynchronous processing.
 * @param {import('express').Request} req  - expects req.file.buffer
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function uploadImage(req, res, next) {
  const { file } = req;
  const requestId = req.requestId;
  logger.debug('Entering uploadImage handler', { requestId, path: req.originalUrl });

  // Ensure a file was provided
  if (!file || !file.buffer) {
    logger.warn('No file or buffer provided in request', { requestId });
    const err = new ValidationError('No file provided');
    return next(err);
  }

  const { buffer, originalname: filename, mimetype } = file;
  logger.debug('File metadata', {
    requestId,
    filename,
    mimetype,
    size: buffer.byteLength
  });

  logger.info('Received upload request', { requestId, filename, size: buffer.byteLength });

  try {
    logger.debug('Enqueueing image upload job', { requestId, filename });
    const enqueueStart = Date.now();

    const jobId = await enqueueImageUpload(buffer, filename, mimetype);

    const enqueueDuration = `${Date.now() - enqueueStart}ms`;
    logger.info('Image upload job enqueued', {
      requestId,
      filename,
      jobId,
      enqueueDuration
    });

    logger.debug('Sending 202 Accepted response', { requestId, status: 202 });
    return res.status(202).json({
      success: true,
      message: 'Image upload enqueued successfully',
      requestId,
      jobId
    });
  } catch (err) {
    logger.error('Failed to enqueue image upload', {
      requestId,
      filename,
      error: err.message
    });
    return next(err);
  } finally {
    logger.debug('Exiting uploadImage handler', { requestId });
  }
}
