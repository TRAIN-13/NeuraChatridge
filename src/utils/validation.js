// src/utils/validation.js
import { z } from 'zod';
import { Buffer } from 'buffer';


/**
 * Represents input validation failures with details.
 */
export class ValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.details = details;
  }
}

/**
 * Schema to validate IDs (threadId, userId)
 */
export const IdSchema = z.string()
  .regex(/^[a-zA-Z0-9_-]{5,50}$/, 'Invalid ID format');

// Maximum allowed image size: 2 megabytes
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // bytes

// Supported image MIME types
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
];

/**
 * Validate image buffer and MIME type.
 * Throws ValidationError if:
 *  - Data is not a Buffer or Uint8Array
 *  - MIME type not supported
 *  - Size exceeds MAX_IMAGE_SIZE
 *
 * @param {Buffer|Uint8Array} buffer - Raw image data
 * @param {string} mimetype - MIME type of the image
 */
export function validateImage(buffer, mimetype) {
  // Check buffer type
  if (!buffer || !(Buffer.isBuffer(buffer) || buffer instanceof Uint8Array)) {
    throw new ValidationError('Image data must be a Buffer or Uint8Array', {
      code: 'INVALID_BUFFER'
    });
  }

  // Check MIME type
  if (!ALLOWED_IMAGE_TYPES.includes(mimetype)) {
    throw new ValidationError('Unsupported image type', {
      code: 'UNSUPPORTED_IMAGE_TYPE',
      allowedTypes: ALLOWED_IMAGE_TYPES,
      providedType: mimetype
    });
  }

  // Check size limit
  const size = buffer.length;
  if (size > MAX_IMAGE_SIZE) {
    throw new ValidationError('Image size exceeds the 2MB limit', {
      code: 'IMAGE_TOO_LARGE',
      maxSize: MAX_IMAGE_SIZE,
      actualSize: size
    });
  }
}
