// src/controllers/messageController.js
import logger from '../utils/logger.js';
import { aiAddMessage } from '../services/openaiService.js';
import { addMessageInstant, flushAll } from '../services/messageService.js';
import { updateThreadTimestamp, getUserMessageCount } from '../services/threadService.js';
import { runThreadStream } from '../services/streamService.js';
import { sanitizeError } from '../utils/errorUtils.js';
import { setupConnectionCleanup, sendErrorResponse } from '../utils/messageHelpers.js';
import { initSSE, sendSSEMetaMessage } from '../utils/sseHelpers.js';
import { uploadFile } from '../services/s3Service.js';
import { setTimeout as timerSetTimeout } from 'timers/promises';

// Timeout for OpenAI requests (milliseconds)

// الحد الأقصى لرسائل المستخدم في كل ثريد (افتراضي: 10)
const MAX_USER_MESSAGES = parseInt(process.env.MAX_USER_MESSAGES || '20', 10);
// Timeout for OpenAI requests (milliseconds)
const OPENAI_TIMEOUT = process.env.OPENAI_TIMEOUT || 30000;


/**
 * Handler for adding a new user message to an existing thread.
 * 1) Validates input via middleware (req.validated)
 * 2) Optionally uploads image to S3
 * 3) Persists the user message immediately in Firestore
 * 4) Initializes SSE stream
 * 5) Prepares payload and handles AI interaction asynchronously
 * 6) Streams assistant responses via SSE
 *
 * POST /api/create-messages
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function addMessage(req, res) {
  const { requestId } = req;
  const startTime = Date.now();

  try {
  
  // 0. تحقق من الحد الأقصى لرسائل المستخدم
  const count = await getUserMessageCount(req.validated.threadId);
  if (count >= MAX_USER_MESSAGES) {
    const err = new Error('User message limit reached');
    err.statusCode = 429;
    throw err;
    }
    // 1. Extract validated input
    const { userId, threadId, message: messageContent } = req.validated;
    logger.info('Processing new message', { requestId, userId, threadId });

    // 2. Upload image to S3 if provided
    let imageUrl = null;
    if (req.file?.buffer) {
      logger.debug('Uploading image to S3', { requestId, threadId, filename: req.file.originalname });
      const uploadStart = Date.now();
      const { url } = await uploadFile(req.file.buffer);
      imageUrl = url;
      logger.info('Image uploaded', { requestId, threadId, imageUrl, duration: `${Date.now() - uploadStart}ms` });
    }

    // 3. Persist user message immediately
    await addMessageInstant(threadId, 'user', messageContent, imageUrl);
    await updateThreadTimestamp(threadId);
    logger.info('User message persisted', { requestId, threadId });

    // 4. Initialize SSE stream
    initSSE(res);
    sendSSEMetaMessage(res, threadId, userId);
    setupConnectionCleanup(req, res, threadId);

    // 5. Prepare payload for AI
    const segments = [{ type: 'text', text: messageContent }];
    if (imageUrl) segments.push({ type: 'image_url', image_url: { url: imageUrl } });
    const userPayload = { role: 'user', content: segments };
    logger.debug('User payload prepared', { requestId, threadId });

    // 6. Background: send to OpenAI with timeout
    setImmediate(async () => {
      try {
        logger.debug('Sending payload to OpenAI', { requestId, threadId });
        await Promise.race([
          aiAddMessage(threadId, userPayload),
          timerSetTimeout(OPENAI_TIMEOUT).then(() => { throw new Error('OpenAI request timed out'); })
        ]);
        logger.info('OpenAI processing succeeded', { requestId, threadId });
      } catch (error) {
        logger.error('Background AI processing failed', { requestId, threadId, error });
        // Notify client of background failure via SSE
        res.write(`event: error\ndata:${JSON.stringify({ code: 'BACKGROUND_PROCESS_FAILED', message: error.message, requestId })}\n\n`);
      }
    });

    // 7. Start streaming assistant responses
    return runThreadStream(threadId, req, res);

  } catch (error) {
    // Handle synchronous errors
    logger.error('addMessage handler error', { requestId, error });

    // Flush any buffered messages
    try {
      await flushAll(req.validated?.threadId);
      logger.debug('Flushed buffers after failure', { requestId });
    } catch (flushError) {
      logger.error('Error flushing buffers after failure', { requestId, error: flushError });
    }

    const safeError = sanitizeError(error);
    return sendErrorResponse(res, safeError.code || error.statusCode || 500, safeError.message, requestId);

  } finally {
    // Log handler completion
    const duration = Date.now() - startTime;
    logger.info('addMessage handler completed', { requestId, duration: `${duration}ms` });
  }
}
