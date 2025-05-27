// src/utils/threadHelpers.js
import { v4 as uuidv4 } from 'uuid';
import logger from './logger.js';
import { aiAddMessage } from '../services/openaiService.js';
import { updateThreadTimestamp } from '../services/threadService.js';
import { bufferMessage } from '../services/messageService.js';

/**
 * توليد معرف مؤقت للزائر (Guest User)
 * @returns {string} معرف المستخدم الضيف
 */
export function generateGuestUserId() {
  const guestId = uuidv4();
  logger.debug('Generated guest user ID', { guestId });
  return guestId;
}

/**
 * التحقق من صحة صيغة userId المرسَل من العميل
 * @param {string} userId
 * @returns {string} userId صالح
 * @throws {Error} إذا كانت الصيغة غير صالحة
 */
export function validateUserId(userId) {
  const regex = /^[a-zA-Z0-9_-]{5,30}$/;
  if (!regex.test(userId)) {
    throw new Error('Invalid user ID format');
  }
  return userId;
}

/**
 * معالجة الرسالة الابتدائية: إرسالها إلى OpenAI، تخزينها في Firestore، وتحديث الطابع الزمني
 * @param {string} threadId
 * @param {string} message
 * @param {string} requestId
 */
export async function handleInitialMessage(threadId, message, requestId) {
  try {
    await Promise.all([
      aiAddMessage(threadId, message),
      bufferMessage(threadId, 'user', message),
      updateThreadTimestamp(threadId)
    ]);
    logger.info('Initial message processed', {
      requestId,
      threadId,
      messageLength: message.length
    });
  } catch (err) {
    logger.error('Initial message handling failed', {
      requestId,
      threadId,
      error: err.message
    });
    throw new Error('Failed to process initial message');
  }
}

/**
 * تسجيل نجاح العملية مع مدة التنفيذ
 * @param {number} startTime - timestamp بالبداية
 * @param {string} requestId
 */
export function logOperationSuccess(startTime, requestId) {
  const durationMs = Date.now() - startTime;
  logger.info('Operation succeeded', {
    requestId,
    duration: `${durationMs}ms`
  });
}
