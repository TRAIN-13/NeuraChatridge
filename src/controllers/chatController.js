// src/controllers/chatController.js
import logger from '../utils/logger.js';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../utils/firebase.js';
import { sanitizeError } from '../utils/errorUtils.js';

/**
 * Handler to fetch all messages for a given thread.
 * Assumes validation middleware has populated req.validated with userId and threadId.
 * POST /api/fetch-messages
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function fetchMessages(req, res) {
  const { requestId } = req;
  const startTime = Date.now();

  try {
    // 1. Extract validated input
    const { userId, threadId } = req.validated;
    logger.info('Fetch messages request', { requestId, userId, threadId });

    // 2. Retrieve thread metadata
    const threadRef = doc(db, 'threads', threadId);
    const threadSnap = await getDoc(threadRef);
    if (!threadSnap.exists()) {
      const error = new Error('Thread not found');
      error.statusCode = 404;
      throw error;
    }
    const threadData = threadSnap.data();

    // 3. Verify ownership
    if (threadData.userId && threadData.userId !== userId) {
      const error = new Error('Forbidden');
      error.statusCode = 403;
      throw error;
    }

    // 4. Fetch and format messages
    const msgsCol = collection(db, 'threads', threadId, 'messages');
    const snapshot = await getDocs(msgsCol);
    const messages = snapshot.docs
      .map(docSnap => mapDocToMessage(docSnap.data()))
      .sort((a, b) => a.receivedAt - b.receivedAt);

    logger.info('Messages fetched', { requestId, threadId, count: messages.length });

    // 5. Send response
    return res.status(200).json({ messages });
  } catch (error) {
    logger.error('fetchMessages error', { requestId, error });
    const safeError = sanitizeError(error);
    const status = error.statusCode || 500;
    return res.status(status).json({ error: safeError });
  } finally {
    const duration = Date.now() - startTime;
    logger.info('fetchMessages handler completed', { requestId, duration: `${duration}ms` });
  }
}

/**
 * Map Firestore message data to API response format.
 * @param {object} data
 * @returns {object}
 */
function mapDocToMessage(data) {
  const ts = data.receivedAt;
  const receivedAt = ts?.toMillis?.() ?? (typeof ts === 'number' ? ts : Date.now());

  return {
    seqId: data.seqId,
    author: data.author ?? 'assistant',
    content: {
      text: data.content.text,
      imageUrl: data.content.imageUrl ?? null
    },
    createdAt: data.createdAt,
    receivedAt
  };
}
