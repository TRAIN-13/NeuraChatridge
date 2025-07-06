// src/controllers/imageController.js
import logger from '../utils/logger.js';
import { ProcessingError, ValidationError } from '../utils/ppError.js';
import { ERROR_CODES } from '../utils/errorCodes.js';
import { enqueueImageUpload } from '../services/imageService.js';

/**
 * Initiate image upload: validate, enqueue, and respond.
 * @param {import('express').Request} req  - expects req.file.buffer
 * @param {import('express').Response} res
 */
export async function uploadImage(req, res) {
  const { requestId, locale } = req;
  logger.debug('uploadImage handler start', { requestId, path: req.originalUrl });

  const file = req.file;
  if (!file || !file.buffer) {
    logger.warn('No file provided', { requestId });
    throw new ValidationError(
      ERROR_CODES.VALIDATION.MESSAGE_REQUIRED, // or define IMAGE_REQUIRED
      { locale }
    );
  }

  const { buffer, originalname: filename, mimetype } = file;
  logger.debug('File metadata', { requestId, filename, mimetype, size: buffer.byteLength });

  try {
    logger.info('Enqueue image upload', { requestId, filename });
    const start = Date.now();
    const jobId = await enqueueImageUpload(buffer, filename, mimetype);
    const duration = Date.now() - start;

    logger.info('Image job enqueued', { requestId, filename, jobId, duration: `${duration}ms` });
    res.status(202).json({
      success: true,
      jobId,
      requestId
    });
  } catch (err) {
    logger.error('enqueueImageUpload failed', { requestId, filename, error: err.message });
    // wrap any non-AppError in ProcessingError
    if (!(err instanceof ValidationError || err instanceof ProcessingError)) {
      throw new ProcessingError(
        ERROR_CODES.INTERNAL.UNEXPECTED,
        { locale, original: err.message }
      );
    }
    throw err;
  } finally {
    logger.debug('uploadImage handler exit', { requestId });
  }
}
