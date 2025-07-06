// src/utils/errorCodes.js

/**
 * ERROR_CODES: Defines all application error codes and versioning for tracking changes.
 *
 * - version: Increment this when adding or modifying codes to keep track of API changes.
 * - Grouped by category for clarity.
 */
export const ERROR_CODES = {
  version: "1.0.0",

  VALIDATION: {
    // Exceeded allowed number of messages in a thread
    MESSAGE_LIMIT: "MSG_LIMIT_REACHED",
    // Provided identifier does not match expected pattern
    INVALID_ID_FORMAT: "INVALID_ID_FORMAT",
    // Message text length exceeds configured maximum
    MESSAGE_TOO_LONG: "MESSAGE_TOO_LONG",
    // Required field missing or empty
    FIELD_REQUIRED: "FIELD_REQUIRED"
  },

  DATABASE: {
    // Requested thread not found in Firestore
    THREAD_NOT_FOUND: "THREAD_NOT_FOUND",
    // Generic database error
    DB_ERROR: "DATABASE_ERROR"
  },

  AUTH: {
    // User is not authorized to perform action
    FORBIDDEN: "FORBIDDEN",
    // Authentication required
    UNAUTHORIZED: "UNAUTHORIZED"
  },

  RATE_LIMIT: {
    // Too many requests per unit time
    TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS"
  },

  OPENAI: {
    // Timeout or error when communicating with OpenAI API
    TIMEOUT: "OPENAI_TIMEOUT",
    // Unexpected response format or error
    API_ERROR: "OPENAI_API_ERROR"
  },

  S3: {
    // Error uploading to or accessing S3 storage
    UPLOAD_FAILED: "S3_UPLOAD_FAILED",
    TIMEOUT: "S3_TIMEOUT"
  },

  INTERNAL: {
    // Catch-all for unexpected errors
    UNEXPECTED: "INTERNAL_ERROR"
  }
};
