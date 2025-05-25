/*  To-Do
    Insure that all words are complate before uplode to firestore
*/

// src/services/messageService.js
import { db } from "../utils/firebase.js";
import { collection, addDoc, serverTimestamp, writeBatch, doc } from "firebase/firestore";

// In-memory buffer to collect messages before batch upload
const messageBuffer = new Map();
const BATCH_SIZE = 10;

/**
 * Buffer a message in memory and flush to Firestore when buffer reaches BATCH_SIZE
 * @param {string} threadId
 * @param {"user"|"assistant"} author
 * @param {string} content
 * @returns {Promise<void>}
 */
export async function bufferMessage(threadId, author, content) {
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('Message content must be a non-empty string');
  }

  // Initialize buffer array if necessary
  if (!messageBuffer.has(threadId)) {
    messageBuffer.set(threadId, []);
  }

  // Add to buffer
  const buffer = messageBuffer.get(threadId);
  buffer.push({ author, content });

  // Flush if reached batch size
  if (buffer.length >= BATCH_SIZE) {
    await flushBufferedMessages(threadId);
  }
}

/**
 * Flush buffered messages for a thread to Firestore in a batch write
 * @param {string} threadId
 * @returns {Promise<void>}
 */
export async function flushBufferedMessages(threadId) {
  const buffer = messageBuffer.get(threadId) || [];
  if (buffer.length === 0) return;

  // Prepare batch
  const batch = writeBatch(db);
  const msgsCol = collection(db, `threads/${threadId}/messages`);

  buffer.forEach(({ author, content }) => {
    const docRef = doc(msgsCol); // auto-ID
    batch.set(docRef, {
      author,
      content,
      createdAt: serverTimestamp(),
    });
  });

  // Commit and clear buffer
  await batch.commit();
  messageBuffer.set(threadId, []);
}

/**
 * Force flush any remaining buffered messages for a thread
 * @param {string} threadId
 * @returns {Promise<void>}
 */
export async function flushAll(threadId) {
  await flushBufferedMessages(threadId);
}
