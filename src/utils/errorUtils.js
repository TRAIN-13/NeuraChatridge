// src/utils/errorUtils.js

/**
 * Sanitizes an Error object for safe exposure to clients.
 * Hides sensitive details in production and optionally categorizes the error.
 * @param {Error} err - The original error object
 * @returns {{code: string, message: string, category?: string}}
 */
export function sanitizeError(err) {
  const safeError = {
    code: err.code || 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  };

  // Optional: categorize based on message content
  if (err.message && err.message.includes('Firestore')) {
    safeError.category = 'DATABASE';
  } else if (err.message && err.message.includes('OpenAI')) {
    safeError.category = 'AI_SERVICE';
  }

  return safeError;
}
