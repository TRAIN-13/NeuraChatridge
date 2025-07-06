// src/utils/appError.js
import { ERROR_CODES } from './errorCodes.js';
import { getMessage } from '../locales/i18n.js';

/**
 * Base class for all operational errors in the application.
 * Handles localization and standard error fields.
 */
export class AppError extends Error {
  /**
   * @param {string} errorCode   - One of the codes defined in ERROR_CODES
   * @param {number} statusCode  - HTTP status code to return
   * @param {object} [details]   - Additional context or interpolation params
   *                              (e.g., { max: 20, locale: 'ar' })
   */
  constructor(errorCode, statusCode, details = {}) {
    // Determine locale (fallback to 'en')
    const locale = details.locale || 'en';
    // Fetch translated message template and interpolate params
    const message = getMessage(errorCode, details, locale);
    super(message);

    this.errorCode     = errorCode;
    this.statusCode    = statusCode;
    this.details       = details;
    this.isOperational = true;  // distinguishes expected errors from programming bugs

    // Capture stack trace (excluding constructor)
    Error.captureStackTrace(this, this.constructor);
  }
}

// Specialized error subclasses for common HTTP scenarios
export class ValidationError extends AppError {
  constructor(errorCode, details = {}) {
    super(errorCode, 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(errorCode, details = {}) {
    super(errorCode, 404, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(errorCode, details = {}) {
    super(errorCode, 403, details);
  }
}

export class RateLimitError extends AppError {
  constructor(errorCode, details = {}) {
    super(errorCode, 429, details);
  }
}

export class ProcessingError extends AppError {
  constructor(errorCode, details = {}) {
    super(errorCode, 500, details);
  }
}
