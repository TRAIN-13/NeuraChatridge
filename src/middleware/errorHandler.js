// src/middleware/errorHandler.js
import { AppError, ProcessingError } from '../utils/appError.js';
import { ERROR_CODES } from '../utils/errorCodes.js';
import logger from '../utils/logger.js';
import { getMessage } from '../locales/i18n.js';

/**
 * Centralized error middleware: maps, logs, and responds with a unified JSON error format.
 */
export function errorMiddleware(err, req, res, next) {
  // 1. Map to AppError or fallback to internal error
  let appErr;
  if (err instanceof AppError) {
    appErr = err;
  } else {
    logger.error('Unhandled error', { requestId: req.requestId, error: err, stack: err.stack });
    appErr = new ProcessingError(ERROR_CODES.INTERNAL.UNEXPECTED, { locale: req.locale });
  }

  // 2. Structured logging
  const logMeta = {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    status: appErr.statusCode,
    errorCode: appErr.errorCode,
    details: appErr.details,
    stack: process.env.NODE_ENV === 'development' ? appErr.stack : undefined
  };
  logger.error(appErr.message, logMeta);

  // 3. Send unified JSON error response
  const payload = {
    success: false,
    error: {
      code: appErr.errorCode,
      message: getMessage(appErr.errorCode, appErr.details, req.locale || 'en'),
      details: process.env.NODE_ENV !== 'production' ? appErr.details : undefined
    },
    requestId: req.requestId,
    timestamp: new Date().toISOString()
  };

  res.status(appErr.statusCode).json(payload);
}

/**
 * Wrapper for async route handlers to forward errors to errorMiddleware.
 */
export const wrapAsync = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
