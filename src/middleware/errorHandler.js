// src/middleware/errorHandler.js
import logger from '../utils/logger.js';
import { sanitizeError } from '../utils/errorUtils.js';

export function errorLogger(err, req, res, next) {
  const errorInfo = {
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl,
    error: {
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    },
    processingTime: `${Date.now() - req.startTime}ms`
  };
  logger.error(JSON.stringify(errorInfo));
  const safeError = sanitizeError(err);
  res.status(500).json({ success: false, error: safeError, requestId: req.requestId });
}

export const wrapAsync = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
