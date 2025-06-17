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

  // Ensure a file was provided
  if (!file || !file.buffer) {
    const err = new ValidationError('No file provided');
    return next(err);
  }

  const { buffer, originalname: filename, mimetype } = file;

  logger.info('Received upload request', {
    requestId,
    filename,
    size: buffer.byteLength
  });

  try {
    // Enqueue the upload for background processing
    await enqueueImageUpload(buffer, filename, mimetype);

    // Respond immediately with 202 Accepted
    res.status(202).json({
        success: true,
        message: 'Image upload enqueued successfully',
        requestId
    });
  } catch (err) {
    logger.error('Failed to enqueue image upload', {
        requestId,
        filename,
        error: err.message
    });
    next(err);
  }
}