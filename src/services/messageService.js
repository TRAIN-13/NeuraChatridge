// src/services/messageService.js
import { db } from '../utils/firebase.js';
import { collection, writeBatch, doc, addDoc, runTransaction  } from 'firebase/firestore';
import { ResilientBatcher } from './batchService.js';
import { formatTimestamp } from '../utils/dateUtils.js';

/**
 * دالة onFlush: تكتب دفعة الرسائل في Firestore مع طابع زمني مُرسل من العميل (timestampMs)
 */
async function flushAssistantMessages(threadId, messages) {
  const metaRef = doc(db, `threads/${threadId}/metadata/counter`);
  const msgsCol = collection(db, `threads/${threadId}/messages`);

  await runTransaction(db, async (tx) => {
    // اقرأ آخر seqId
    const metaSnap = await tx.get(metaRef);
    let lastSeq = metaSnap.exists() ? metaSnap.data().lastSeqId : 0;

    // لكل رسالة في الدفعة، زِد seqId واكتبها
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

    // حدّث العداد لمرة واحدة بعد الكتابة
    tx.set(metaRef, { lastSeqId: lastSeq }, { merge: true });
  });
}

/**
 * Batcher لردود المساعد
 */
export const assistantBatcher = new ResilientBatcher({
  batchSize:  parseInt(process.env.BATCH_SIZE       || '5',    10),
  maxDelay:   parseInt(process.env.BATCH_MAX_DELAY  || '2000', 10),
  onFlush:    flushAssistantMessages,
  maxRetries: parseInt(process.env.MAX_BATCH_RETRIES || '3',  10),
  retryDelay: parseInt(process.env.BATCH_RETRY_DELAY  || '1000', 10)
});

/**
 * حفظ رسالة المستخدم أو المساعد فوراً في Firestore بالهيكل الجديد:
 * {
 *   author: 'user'|'assistant',
 *   content: { text, imageUrl? },
 *   createdAt: string,     // منسّق
 *   receivedAt: number     // timestamp بالملّي ثانية
 * }
 */
export async function addMessageInstant(threadId, author, text, imageUrl) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Message content must be a non-empty string');
  }

  const metaRef = doc(db, `threads/${threadId}/metadata/counter`);
  const msgsCol = collection(db, `threads/${threadId}/messages`);

  await runTransaction(db, async (tx) => {
    // 1. اقرأ عدّاد التسلسل الحالي
    const metaSnap = await tx.get(metaRef);
    const lastSeq = metaSnap.exists() ? metaSnap.data().lastSeqId : 0;
    const nextSeq = lastSeq + 1;

    // 2. حدّث عدّاد التسلسل
    tx.set(metaRef, { lastSeqId: nextSeq }, { merge: true });

    // 3. جهّز بيانات الرسالة مع seqId
    const timestampMs = Date.now();
    const createdAt = formatTimestamp(timestampMs);
    const msg = {
      seqId: nextSeq,
      author,
      content: { text, ...(imageUrl && { imageUrl }) },
      createdAt,
      receivedAt: timestampMs
    };

    // 4. أضف الرسالة
    const msgRef = doc(msgsCol);
    tx.set(msgRef, msg);
  });
}

/**
 * أضف رسالة (نصيّة أو معها رابط صورة) إلى البافر للكتابة لاحقًا دفعة واحدة
 * @param {string} threadId
 * @param {'user'|'assistant'} author
 * @param {string} text
 * @param {string} [imageUrl]
 */
export function bufferMessage(threadId, author, text, imageUrl) {
  const timestampMs = Date.now();
  const content = { text };
  if (imageUrl) {
    content.imageUrl = imageUrl;
  }
  return assistantBatcher.add(threadId, { author, content, timestampMs });
}

/**
 * إفراغ أي رسائل متبقية في البافر (مثلاً عند نهاية الجلسة)
 */
export async function flushAll(threadId) {
  await assistantBatcher.flushAll(threadId);
}
