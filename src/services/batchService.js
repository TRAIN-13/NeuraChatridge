// src/services/batchService.js
import logger from '../utils/logger.js';
import { doc, collection, runTransaction } from 'firebase/firestore';
import { formatTimestamp } from '../utils/dateUtils.js';
import { v4 as uuidv4 } from 'uuid';
import CircuitBreaker from 'opossum';
import { ProcessingError } from '../utils/appError.js';
import { db } from '../utils/firebase.js';  // don’t forget to import your Firestore instance

/**
 * Core flush logic: writes a batch of assistant messages into Firestore.
 * @param {string} threadId
 * @param {Array<{author:string,content:{text:string,imageUrl?:string},timestampMs:number}>} messages
 */
async function flushAssistantMessages(threadId, messages) {
  const context = { threadId, count: messages.length };
  logger.debug('flushAssistantMessages: called', context);
  const startTime = Date.now();

  const metaRef = doc(db, `threads/${threadId}/metadata/counter`);
  const msgsCol = collection(db, `threads/${threadId}/messages`);

  try {
    await runTransaction(db, async tx => {
      const metaSnap = await tx.get(metaRef);
      let lastSeq = metaSnap.exists() ? metaSnap.data().lastSeqId : 0;

      for (const { author, content, timestampMs } of messages) {
        lastSeq += 1;
        const createdAt = formatTimestamp(timestampMs);
        const msg = {
          seqId: lastSeq,
          author,
          content: {
            text: content.text,
            ...(content.imageUrl && { imageUrl: content.imageUrl })
          },
          createdAt,
          receivedAt: timestampMs
        };
        const msgRef = doc(msgsCol);
        tx.set(msgRef, msg);
      }

      tx.set(metaRef, { lastSeqId: lastSeq }, { merge: true });
    });

    const duration = Date.now() - startTime;
    logger.info('flushAssistantMessages: transaction committed', {
      threadId,
      count: messages.length,
      duration: `${duration}ms`
    });
  } catch (err) {
    logger.error('flushAssistantMessages: transaction failed', {
      threadId,
      error: err.message
    });
    throw err;
  }
}

// Circuit Breaker configuration
const breakerOptions = {
  timeout: 20000,                // 20s timeout
  errorThresholdPercentage: 50,  // open circuit if ≥50% calls fail
  resetTimeout: 30000            // try again after 30s
};

// Wrap the flush function in a circuit breaker
const flushBreaker = new CircuitBreaker(flushAssistantMessages, breakerOptions);

// If circuit is open, fallback to a direct write (or escalate)
flushBreaker.fallback(async (threadId, messages) => {
  logger.warn('Fallback: circuit open, writing directly', {
    threadId,
    count: messages.length
  });
  // attempt direct flush once more
  return flushAssistantMessages(threadId, messages);
});

// Log when circuit opens
flushBreaker.on('open', () => {
  logger.warn('Circuit breaker opened for flushAssistantMessages');
});

/**
 * ResilientBatcher: buffers messages and flushes them in batches,
 * using retry logic and a circuit breaker for the actual write.
 */
export class ResilientBatcher {
  /**
   * @param {Object} config
   * @param {number} config.batchSize
   * @param {number} config.maxDelay
   * @param {number} [config.maxRetries]
   * @param {number} [config.retryDelay]
   */
  constructor({ batchSize, maxDelay, maxRetries = 3, retryDelay = 1000 }) {
    if (batchSize < 1) throw new Error('batchSize must be ≥1');
    if (maxDelay < 0) throw new Error('maxDelay must be ≥0');

    this.batchSize = batchSize;
    this.maxDelay = maxDelay;
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;

    this.buffers = new Map();    // threadId → [items]
    this.timers = new Map();     // threadId → setTimeout
    this.locks = new Map();      // threadId → boolean
    this.pending = new Map();    // threadId → Set<opId>
  }

  async add(threadId, item) {
    if (!this.buffers.has(threadId)) this._initThread(threadId);
    const timestampMs = typeof item.receivedAt === 'number' ? item.receivedAt : Date.now();
    this.buffers.get(threadId).push({ ...item, timestampMs });

    const len = this.buffers.get(threadId).length;
    if (len >= this.batchSize) {
      clearTimeout(this.timers.get(threadId));
      await this._scheduleFlush(threadId);
    } else {
      clearTimeout(this.timers.get(threadId));
      this.timers.set(
        threadId,
        setTimeout(() => this._scheduleFlush(threadId), this.maxDelay)
      );
    }
  }

  _initThread(threadId) {
    this.buffers.set(threadId, []);
    this.locks.set(threadId, false);
    this.pending.set(threadId, new Set());
  }

  async _scheduleFlush(threadId) {
    if (this.locks.get(threadId)) return;
    this.locks.set(threadId, true);
    try {
      await this._flushWithRetry(threadId);
    } finally {
      this.locks.set(threadId, false);
    }
  }

  async _flushWithRetry(threadId, attempt = 1) {
    const items = this._drainBuffer(threadId);
    if (!items.length) return;

    const opId = uuidv4().slice(0, 8);
    this.pending.get(threadId).add(opId);

    try {
      // Use the circuit breaker to flush
      await flushBreaker.fire(threadId, items);
      this.pending.get(threadId).delete(opId);
    } catch (err) {
      this.pending.get(threadId).delete(opId);
      logger.error('ResilientBatcher flush failed', {
        threadId,
        opId,
        attempt,
        error: err.message
      });

      if (attempt < this.maxRetries) {
        await this._delay(this.retryDelay * attempt);
        // re-buffer and retry
        this.buffers.get(threadId).unshift(...items);
        return this._flushWithRetry(threadId, attempt + 1);
      } else {
        logger.error('Permanent flush failure', { threadId, opId });
      }
    }
  }

  _drainBuffer(threadId) {
    const items = this.buffers.get(threadId) || [];
    this.buffers.set(threadId, []);
    return items;
  }

  async flush(threadId) {
    clearTimeout(this.timers.get(threadId));
    const items = this._drainBuffer(threadId);
    if (!items.length) return;
    try {
      await flushBreaker.fire(threadId, items);
    } catch {
      logger.error('Immediate flush failed', { threadId });
    }
  }

  async flushAll() {
    for (const threadId of this.buffers.keys()) {
      clearTimeout(this.timers.get(threadId));
      await this._scheduleFlush(threadId);
    }
  }

  async gracefulShutdown() {
    await this.flushAll();
    for (const ops of this.pending.values()) {
      while (ops.size) {
        await this._delay(500);
      }
    }
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
