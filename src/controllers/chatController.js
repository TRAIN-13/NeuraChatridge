// src/controllers/chatController.js
import logger from '../utils/logger.js';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../utils/firebase.js';
import { NotFoundError, ForbiddenError } from '../utils/appError.js';
import { ERROR_CODES } from '../utils/errorCodes.js';

/**
 * Handler to fetch all messages for a given thread.
 * Assumes validation middleware has populated req.validated with userId and threadId.
 * POST /api/fetch-messages
 */
export async function fetchMessages(req, res) {
  const { requestId, locale } = req;
  const startTime = Date.now();
  const { userId, threadId } = req.validated;

  logger.info('Fetch messages request', { requestId, userId, threadId });

  // Retrieve thread metadata
  const threadRef = doc(db, 'threads', threadId);
  const threadSnap = await getDoc(threadRef);
  if (!threadSnap.exists()) {
    throw new NotFoundError(
      ERROR_CODES.DATABASE.THREAD_NOT_FOUND,
      { threadId, locale }
    );
  }
  const threadData = threadSnap.data();

  // Verify ownership
  if (threadData.userId && threadData.userId !== userId) {
    throw new ForbiddenError(
      ERROR_CODES.AUTH.FORBIDDEN,
      { threadId, userId, locale }
    );
  }

  // Fetch and format messages
  const msgsCol = collection(db, 'threads', threadId, 'messages');
  const snapshot = await getDocs(msgsCol);
  const messages = snapshot.docs
    .map(docSnap => mapDocToMessage(docSnap.data()))
    .sort((a, b) => a.receivedAt - b.receivedAt);

  logger.info('Messages fetched', { requestId, threadId, count: messages.length });

  res.status(200).json({ messages });

  const duration = Date.now() - startTime;
  logger.info('fetchMessages handler completed', { requestId, duration: `${duration}ms` });
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