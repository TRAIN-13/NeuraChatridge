// src/controllers/threadController.js
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import {
  createAIThread,
  aiAddMessage
} from '../services/openaiService.js';
import {
  createFSThread,
  updateThreadTimestamp
} from '../services/threadService.js';
import { bufferMessage } from '../services/messageService.js';
import { runThreadStream } from '../services/streamService.js';
import {
  generateGuestUserId,
  validateUserId,
  handleInitialMessage,
  logOperationSuccess
} from '../utils/threadHelpers.js';
import { sanitizeError } from '../middleware/errorHandler.js';

/**
 * POST /api/threads
 * إنشاء ثريد جديد مع رسالة ابتدائية
 * الرسالة الابتدائية إجبارية.
 */
export async function createThread(req, res, next) {
  const { requestId } = req;
  const startTime = Date.now();

  try {
    // 1. استخراج المدخلات والتحقق
    const { user_Id: rawUserId, message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Initial message is required' },
        requestId
      });
    }

    // 2. تحديد userId
    const isGuest = !rawUserId;
    const userId = isGuest
      ? generateGuestUserId()
      : validateUserId(rawUserId);

    logger.info('Creating thread', { requestId, userId, isGuest });

    // 3. إنشاء ثريد في OpenAI وFirestore
    const threadId = await createAIThread();
    await createFSThread(userId, threadId);

    logger.debug('External services initialized', { requestId, threadId });

    // 4. معالجة الرسالة الابتدائية
    await handleInitialMessage(threadId, message.trim(), requestId);

    // 5. بدء تدفق SSE
    return runThreadStream(threadId, req, res);

  } catch (err) {
    logger.error('Thread creation failed', {
      requestId,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    // إرسال خطأ معقم للعميل
    const safeError = sanitizeError(err, req);
    return res.status(500).json({ success: false, error: safeError, requestId });
  } finally {
    logOperationSuccess(startTime, requestId);
  }
}