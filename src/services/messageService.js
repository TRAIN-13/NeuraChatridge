// src/services/messageService.js
import logger from '../utils/logger.js';
import { db } from '../utils/firebase.js';
import { doc, collection, increment, runTransaction } from 'firebase/firestore';
import CircuitBreaker from 'opossum';
import { ResilientBatcher } from './batchService.js';
import { formatTimestamp } from '../utils/dateUtils.js';
import { ProcessingError } from '../utils/appError.js';
import { ERROR_CODES } from '../utils/errorCodes.js';
import { incrementUserMessageCount } from './threadService.js';

// Circuit Breaker options for transactional ops
const breakerOptions = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
};

/**
 * Transactional flush of assistant messages into Firestore.
 * @param {string} threadId
 * @param {Array<{author:string,content:any,timestampMs:number}>} messages
 */
async function flushAssistantMessages(threadId, messages) {
  const context = { threadId };
  logger.debug('flushAssistantMessages: called', { ...context, count: messages.length });
  const startTime = Date.now();

  const metaRef = doc(db, `threads/${threadId}/metadata/counter`);
  const msgsCol = collection(db, `threads/${threadId}/messages`);

  await runTransaction(db, async tx => {
    const metaSnap = await tx.get(metaRef);
    let lastSeq = metaSnap.exists() ? metaSnap.data().lastSeqId : 0;

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
      tx.set(doc(msgsCol), msg);
    }

    tx.set(metaRef, { lastSeqId: lastSeq }, { merge: true });
  });

  const duration = Date.now() - startTime;
  logger.info('flushAssistantMessages: transaction committed', { ...context, count: messages.length, duration: `${duration}ms` });
}

// Circuit breaker wrapping flushAssistantMessages
const flushBreaker = new CircuitBreaker(flushAssistantMessages, breakerOptions);
flushBreaker.on('open', () => logger.warn('Circuit opened for flushAssistantMessages'));
flushBreaker.fallback(() => { throw new ProcessingError(ERROR_CODES.INTERNAL.UNEXPECTED, {}); });

// Batcher for assistant responses using circuit breaker
export const assistantBatcher = new ResilientBatcher({
  batchSize:  parseInt(process.env.BATCH_SIZE      || '5',    10),
  maxDelay:   parseInt(process.env.BATCH_MAX_DELAY || '2000', 10),
  onFlush:    (threadId, messages) => flushBreaker.fire(threadId, messages),
  maxRetries: parseInt(process.env.MAX_BATCH_RETRIES || '3',   10),
  retryDelay: parseInt(process.env.BATCH_RETRY_DELAY  || '1000', 10)
});

/**
 * Persist a single user message immediately in Firestore.
 */
export async function addMessageInstant(threadId, author, text, imageUrl) {
  const context = { threadId, author };
  logger.debug('addMessageInstant: called', { ...context, textLength: text.length, hasImage: Boolean(imageUrl) });
  if (typeof text !== 'string' || !text.trim()) {
    logger.error('addMessageInstant: invalid message content', context);
    throw new ProcessingError(ERROR_CODES.VALIDATION.MESSAGE_REQUIRED, { locale: 'en' });
  }

  // Wrap runTransaction in circuit breaker as well
  const instantBreaker = new CircuitBreaker(async () => {
    const metaRef = doc(db, `threads/${threadId}/metadata/counter`);
    const msgsCol = collection(db, `threads/${threadId}/messages`);
    await runTransaction(db, async tx => {
      const snap = await tx.get(metaRef);
      const lastSeq = snap.exists() ? snap.data().lastSeqId : 0;
      const nextSeq = lastSeq + 1;

      tx.set(metaRef, { lastSeqId: nextSeq }, { merge: true });
      const timestampMs = Date.now();
      const createdAt = formatTimestamp(timestampMs);
      const msg = { seqId: nextSeq, author, content: { text, ...(imageUrl && { imageUrl }) }, createdAt, receivedAt: timestampMs };
      tx.set(doc(msgsCol), msg);
      tx.update(metaRef, { userMessageCount: increment(1) });
    });
  }, breakerOptions);

  try {
    await instantBreaker.fire();
    //await incrementUserMessageCount(threadId);
    logger.info('addMessageInstant: message saved to Firestore', context);
  } catch (err) {
    logger.error('addMessageInstant: transaction failed', { ...context, error: err.message });
    throw err;
  }
}

/**
 * Buffer a message for later batch write.
 */
export function bufferMessage(threadId, author, text, imageUrl) {
  const timestampMs = Date.now();
  return assistantBatcher.add(threadId, { author, content: { text, ...(imageUrl && { imageUrl }) }, timestampMs });
}

/**
 * Flush any remaining buffered messages.
 */
export async function flushAll(threadId) {
  try {
    await assistantBatcher.flushAll(threadId);
    logger.info('flushAll: all buffered messages flushed', { threadId });
  } catch (err) {
    logger.error('flushAll: failed to flush buffers', { threadId, error: err.message });
    throw err;
  }
}
