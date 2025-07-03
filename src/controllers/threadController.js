// src/controllers/threadController.js
import logger from '../utils/logger.js';
import { createAIThread } from '../services/openaiService.js';
import { createFSThread } from '../services/threadService.js';
import { runThreadStream } from '../services/streamService.js';
import {
  generateGuestUserId,
  validateUserId,
  handleInitialMessage,
} from '../utils/threadHelpers.js';
import { sanitizeError } from '../utils/errorUtils.js';
import { initSSE, sendSSEMetaThread } from '../utils/sseHelpers.js';

/**
 * Controller to create a new chat thread, send SSE metadata,
 * process the initial message in the background, and start AI streaming.
 * Assumes request validation middleware has populated req.validated.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function createThread(req, res) {
  const { requestId } = req;
  const startTime = Date.now();

  // Extract and sanitize validated input
  const { user_Id: rawUserId, message } = req.validated;
  const messageContent = message.trim();

  // Determine or generate user ID
  const isGuest = !rawUserId;
  const userId = isGuest
    ? generateGuestUserId()
    : validateUserId(rawUserId);

  logger.info('Starting thread creation', { requestId, userId, isGuest });

  try {
    // 1. Create AI thread and Firestore document
    const threadId = await createAIThread();
    await createFSThread(userId, threadId, isGuest);
    logger.info('Thread created', { requestId, threadId });

    // 2. Initialize SSE and send metadata
    initSSE(res);
    sendSSEMetaThread(res, threadId, userId, isGuest);

    // 3. Process initial message asynchronously
    setImmediate(async () => {
      try {
        await handleInitialMessage(threadId, messageContent, requestId);
        logger.info('Initial message processed', { requestId, threadId });
      } catch (error) {
        logger.error('Initial message handling error', { requestId, threadId, error });
        // Notify client via SSE
        res.write(`event: error\ndata:${JSON.stringify({
          code: 'INITIAL_MESSAGE_FAILED',
          message: error.message,
        })}\n\n`);
      }
    });

    // 4. Start AI streaming
    return runThreadStream(threadId, req, res);
  } catch (error) {
    // Handle synchronous errors
    logger.error('Thread creation failed', { requestId, error });
    const safeError = sanitizeError(error);
    res.status(error.statusCode || 500).json({ success: false, error: safeError, requestId });
  } finally {
    const duration = Date.now() - startTime;
    logger.info('createThread handler finished', { requestId, duration: `${duration}ms` });
  }
}
