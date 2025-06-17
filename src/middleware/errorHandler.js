// src/middleware/errorHandler.js
import logger from '../utils/logger.js';
import { sanitizeError } from '../utils/errorUtils.js';

/**
 * Central error-logging middleware.
 * Detects error type, sets appropriate HTTP status, and returns a safe error payload.
 */
export function errorLogger(err, req, res, next) {
  // Assign HTTP status code based on error name/type
  if (err.name === 'ValidationError') {
    // 413 for payload too large, 400 for other validations
    err.statusCode = err.details?.code === 'IMAGE_TOO_LARGE' ? 413 : 400;
  } else if (err.name === 'AwsError' || err.name === 'S3Error') {
    // Upstream service failure
    err.statusCode = err.statusCode || 502;
  } else if (err.name === 'ProcessingError' ) {
    // Internal processing errors
    err.statusCode = err.statusCode || 500;
  } else if (err.name === 'TimeoutError') {
    // Operation timed out
    err.statusCode = 504;
  } else if (err.name === 'JobFailedError') {
    // Bull queue job failed permanently
    err.statusCode = err.statusCode || 502;
  }

  // Fallback to explicitly set statusCode or default
  const status = err.statusCode || 500;

  // Log detailed error info
  const errorInfo = {
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl,
    status,
    error: {
      message: err.message,
      // Include stack in development only
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    },
    processingTime: `${Date.now() - req.startTime}ms`
  };
  logger.error(JSON.stringify(errorInfo));

  // Build safe error payload
  const safeError = sanitizeError(err);
  // Include error details in non-production
  if (process.env.NODE_ENV !== 'production' && err.details) {
    safeError.details = err.details;
  }

  // Send response
  res.status(status).json({ success: false, error: safeError, requestId: req.requestId });
}

/**
 * Wraps async route handlers so errors are forwarded to errorLogger
 */
export const wrapAsync = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
