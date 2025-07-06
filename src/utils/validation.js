// src/utils/validation.js
import { z } from 'zod';
import { ValidationError } from './appError.js';
import { ERROR_CODES }    from './errorCodes.js';


/**
 * Custom error class for validation failures.
 * Carries detailed issues and sends a precise message.
 * @extends Error
 */

// ======== PATTERNS ========
const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{5,50}$/;
const THREAD_ID_PATTERN = /^[a-zA-Z0-9_-]{5,50}$/;
const MAX_MESSAGE_LENGTH = 500;

// ======== ERROR MESSAGES ========
const ERROR_MESSAGES = {
  USER_ID: 'معرف المستخدم يجب أن يتكون من 5 إلى 50 حرفاً (أحرف، أرقام، _ ، -)',
  THREAD_ID: 'معرف الثريد يجب أن يتكون من 5 إلى 50 حرفاً (أحرف، أرقام، _ ، -)',
  MESSAGE_REQUIRED: 'محتوى الرسالة مطلوب',
  MESSAGE_TOO_LONG: `الرسالة يجب ألا تتجاوز ${MAX_MESSAGE_LENGTH} حرفاً`,
};

// ======== SCHEMAS ========

/**
 * Schema for creating a new thread.
 * POST /api/threads
 */
export const createThreadSchema = z.object({
  user_Id: z
    .string()
    .regex(USER_ID_PATTERN, ERROR_MESSAGES.USER_ID)
    .optional(),
  message: z
    .string()
    .min(1, ERROR_MESSAGES.MESSAGE_REQUIRED)
    .max(MAX_MESSAGE_LENGTH, ERROR_MESSAGES.MESSAGE_TOO_LONG),
}).strict().strip();

/**
 * Base schema for operations requiring userId and threadId.
 */
const baseSchema = z.object({
  userId: z.string().regex(USER_ID_PATTERN, ERROR_MESSAGES.USER_ID),
  threadId: z.string().regex(THREAD_ID_PATTERN, ERROR_MESSAGES.THREAD_ID),
}).strict().strip();

/**
 * Schema for adding messages.
 * POST /api/create-messages
 */
export const addMessageSchema = baseSchema.extend({
  message: z
    .string()
    .min(1, ERROR_MESSAGES.MESSAGE_REQUIRED)
    .max(MAX_MESSAGE_LENGTH, ERROR_MESSAGES.MESSAGE_TOO_LONG),
});

/**
 * Schema for fetching messages.
 * POST /api/fetch-messages
 */
export const fetchMessagesSchema = baseSchema;

// ======== VALIDATION MIDDLEWARE ========

/**
 * Returns Express middleware to validate req.body against the given Zod schema.
 * On success, attaches parsed data to req.validated.
 * On failure, throws ValidationError with detailed reasons.
 *
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 */
export function validate(schema) {
  return (req, res, next) => {
    // Normalize alias fields
    const raw = { ...req.body };
    if (raw.user_Id && !raw.userId) raw.userId = raw.user_Id;
    if (raw.thread_Id && !raw.threadId) raw.threadId = raw.thread_Id;
    // Remove aliases to avoid unrecognized keys
    delete raw.user_Id;
    delete raw.thread_Id;

    try {
      const parsed = schema.parse(raw);
      // ==== تحقق إضافي لطول الرسالة ====
      if (parsed.message && parsed.message.length > MAX_MESSAGE_LENGTH) {
        throw new ValidationError(
          ERROR_CODES.VALIDATION.MESSAGE_TOO_LONG,
          { max: MAX_MESSAGE_LENGTH, actual: parsed.message.length, locale: req.locale }
        );
      }
      req.validated = parsed;
      return next();
    } catch (zodError) {
      // Extract field-specific issues
      const issues = zodError.errors.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));
      // Compose a detailed message from issues
      const message = issues
        .map(i => `${i.field ? i.field + ': ' : ''}${i.message}`)
        .join('; ');
      return next(new ValidationError(message, { issues }));
    }
  };
}