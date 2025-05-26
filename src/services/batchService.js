/* src/services/batchService.js */

/**
 * Generic batch buffer utility. Collects items and calls onFlush when reaching batchSize.
 */
export class BatchBuffer {
  constructor(batchSize, onFlush) {
    if (typeof batchSize !== 'number' || batchSize < 1) {
      throw new Error('batchSize must be a positive integer');
    }
    if (typeof onFlush !== 'function') {
      throw new Error('onFlush must be a function');
    }
    this.batchSize = batchSize;
    this.onFlush = onFlush;
    this.buffers = new Map();
    this.flushing = new Map();
  }

  /**
   * Add an item to the buffer. Returns a Promise that resolves after any flush triggered.
   */
  async add(threadId, item) {
    if (!this.buffers.has(threadId)) {
      this.buffers.set(threadId, []);
      this.flushing.set(threadId, false);
    }
    const arr = this.buffers.get(threadId);
    arr.push(item);

    if (arr.length >= this.batchSize && !this.flushing.get(threadId)) {
      this.flushing.set(threadId, true);
      try {
        await this.flush(threadId);
      } finally {
        this.flushing.set(threadId, false);
      }
    }
  }

  /**
   * Flush the buffer for a thread.
   */
  async flush(threadId) {
    const arr = this.buffers.get(threadId) || [];
    if (arr.length === 0) return;
    // Clear buffer before onFlush to prevent duplicates
    this.buffers.set(threadId, []);
    await this.onFlush(threadId, arr);
  }

  /**
   * Force flush any remaining items
   */
  async flushAll(threadId) {
    // Prevent concurrent flush
    if (this.flushing.get(threadId)) {
      // Wait a moment and retry
      await new Promise(r => setTimeout(r, 50));
    }
    await this.flush(threadId);
  }
}
