// src/services/messageService.js
import logger from '../utils/logger.js';
import { db } from '../utils/firebase.js';
import { collection, doc, runTransaction } from 'firebase/firestore';
import { ResilientBatcher } from './batchService.js';
import { formatTimestamp } from '../utils/dateUtils.js';

/**
 * Flush a batch of assistant messages into Firestore with client timestamp
 */
async function flushAssistantMessages(threadId, messages) {
  const context = { threadId };
  logger.debug('flushAssistantMessages: called', { ...context, count: messages.length });
  const startTime = Date.now();
  
  const metaRef = doc(db, `threads/${threadId}/metadata/counter`);
  const msgsCol = collection(db, `threads/${threadId}/messages`);

  try {
    logger.debug('flushAssistantMessages: starting transaction', context);
    await runTransaction(db, async (tx) => {
      const metaSnap = await tx.get(metaRef);
      let lastSeq = metaSnap.exists() ? metaSnap.data().lastSeqId : 0;
      logger.debug('flushAssistantMessages: current lastSeq', { ...context, lastSeq });

      for (const { author, content, timestampMs } of messages) {
        lastSeq += 1;
        const createdAt = formatTimestamp(timestampMs);
        const msg = {
          seqId: lastSeq,
          author,
          content: { text: content.text, ...(content.imageUrl && { imageUrl: content.imageUrl }) },
          createdAt,
          receivedAt: timestampMs
        };
        const msgRef = doc(msgsCol);
        tx.set(msgRef, msg);
        logger.debug('flushAssistantMessages: queued message write', { ...context, seqId: lastSeq, author });
      }

      tx.set(metaRef, { lastSeqId: lastSeq }, { merge: true });
      logger.debug('flushAssistantMessages: updated counter', { ...context, lastSeq });
    });

    const duration = Date.now() - startTime;
    logger.info('flushAssistantMessages: transaction committed', { ...context, count: messages.length, duration: `${duration}ms` });
  } catch (err) {
    logger.error('flushAssistantMessages: transaction failed', { ...context, error: err.message });
    throw err;
  }
}

/**
 * Batcher for assistant responses
 */
export const assistantBatcher = new ResilientBatcher({
  batchSize:  parseInt(process.env.BATCH_SIZE       || '5',    10),
  maxDelay:   parseInt(process.env.BATCH_MAX_DELAY  || '2000', 10),
  onFlush:    flushAssistantMessages,
  maxRetries: parseInt(process.env.MAX_BATCH_RETRIES || '3',  10),
  retryDelay: parseInt(process.env.BATCH_RETRY_DELAY  || '1000', 10)
});

/**
 * Save a single message immediately in Firestore
 */
export async function addMessageInstant(threadId, author, text, imageUrl) {
  const context = { threadId, author };
  logger.debug('addMessageInstant: called', { ...context, textLength: text.length, hasImage: Boolean(imageUrl) });
  if (typeof text !== 'string' || !text.trim()) {
    logger.error('addMessageInstant: invalid message content', context);
    throw new Error('Message content must be a non-empty string');
  }

  const metaRef = doc(db, `threads/${threadId}/metadata/counter`);
  const msgsCol = collection(db, `threads/${threadId}/messages`);
  const startTime = Date.now();

  try {
    logger.debug('addMessageInstant: starting transaction', context);
    await runTransaction(db, async (tx) => {
      const metaSnap = await tx.get(metaRef);
      const lastSeq = metaSnap.exists() ? metaSnap.data().lastSeqId : 0;
      const nextSeq = lastSeq + 1;

      tx.set(metaRef, { lastSeqId: nextSeq }, { merge: true });
      const timestampMs = Date.now();
      const createdAt = formatTimestamp(timestampMs);
      const msg = { seqId: nextSeq, author, content: { text, ...(imageUrl && { imageUrl }) }, createdAt, receivedAt: timestampMs };
      const msgRef = doc(msgsCol);
      tx.set(msgRef, msg);
      logger.debug('addMessageInstant: wrote message', { ...context, seqId: nextSeq });
    });

    const duration = Date.now() - startTime;
    logger.info('addMessageInstant: message saved to Firestore', { ...context, duration: `${duration}ms` });
  } catch (err) {
    logger.error('addMessageInstant: transaction failed', { ...context, error: err.message });
    throw err;
  }
}

/**
 * Buffer a message for later batch write
 */
export function bufferMessage(threadId, author, text, imageUrl) {
  logger.debug('bufferMessage: buffering message', { threadId, author, textLength: text.length, hasImage: Boolean(imageUrl) });
  const timestampMs = Date.now();
  const content = { text, ...(imageUrl && { imageUrl }) };
  return assistantBatcher.add(threadId, { author, content, timestampMs });
}

/**
 * Flush any remaining buffered messages
 */
export async function flushAll(threadId) {
  logger.debug('flushAll: flushing all buffered messages', { threadId });
  try {
    await assistantBatcher.flushAll(threadId);
    logger.info('flushAll: all buffered messages flushed', { threadId });
  } catch (err) {
    logger.error('flushAll: failed to flush buffers', { threadId, error: err.message });
    throw err;
  }
}
