// src/utils/logger.js
import winston from 'winston';
import { sanitizeError as _sanitizeError } from '../middleware/errorHandler.js'; // re-export or internal

const { combine, timestamp, printf, colorize } = winston.format;

// تنسيق مخصص للسجلات
const logFormat = printf(({ level, message, timestamp, ...meta }) => {
  let log = `${timestamp} [${level}] : ${message}`;
  if (Object.keys(meta).length) {
    log += ` ${JSON.stringify(meta)}`;
  }
  return log;
});

// إنشاء المُسجِّل
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp(),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp(),
        logFormat
      )
    })
    // يمكنك إضافة ملفات لرجوع السجلات أو خدمات مركبة إذا لزم الأمر
  ],
  exitOnError: false
});

/**
 * Sanitizes an Error object for safe exposure to clients.
 * In production, hides sensitive details.
 * @param {Error} err
 * @returns {{code: string, message: string}}
 */
export function sanitizeError(err) {
  return {
    code: err.code || 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  };
}

/**
 * Express middleware to catch and log errors centrally.
 * ثم يرسل استجابة 500 للعميل مع معرف الطلب.
 */
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

  res.status(500).json({
    error: 'Internal Server Error',
    errorId: req.requestId
  });
}

/**
 * Utility to wrap async route handlers and forward errors to errorLogger.
 */
export const wrapAsync = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export default logger;