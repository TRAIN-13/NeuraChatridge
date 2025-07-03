import { db } from "../utils/firebase.js";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, increment } from "firebase/firestore";

/**
 * Create (or update) a thread document in Firestore under collection `threads`.
 * @param {string?} userId - Optional user ID associated with the thread.
 * @param {string} threadId - ID of the thread to create or update.
 * @returns {Promise<void>} - Resolves when the document write completes.
 */
 /**
  * @param {string|null} userId
  * @param {string} threadId
  * @param {boolean} isGuest
  */
export async function createFSThread(userId, threadId, isGuest) {

  const threadRef = doc(db, "threads", threadId);
  const data = {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isGuest
  };
  if (userId) data.userId = userId;
  
  await setDoc(threadRef, data);
  
  const metaRef = doc(db, "threads", threadId, "metadata", "counter");
  await setDoc(metaRef, {
    lastSeqId: 0,
    userMessageCount: 0    // يبدأ العداد من صفر
  });

}

/**
 * ترجع عدد رسائل المستخدم الحالية من ميتاداتا الـ counter.
 * @param {string} threadId
 * @returns {Promise<number>}
 */
export async function getUserMessageCount(threadId) {
  const metaRef = doc(db, `threads/${threadId}/metadata/counter`);
  const snap = await getDoc(metaRef);
  return snap.exists() ? snap.data().userMessageCount : 0;
}

/**
 * تزيد عداد رسائل المستخدم ذرّيًا في ميتاداتا الـ counter.
 * @param {string} threadId
 * @returns {Promise<void>}
 */
export async function incrementUserMessageCount(threadId) {
  const metaRef = doc(db, `threads/${threadId}/metadata/counter`);
  await updateDoc(metaRef, {
    userMessageCount: increment(1)
  });
}


/**
 * Update the `updatedAt` timestamp of an existing thread document.
 * @param {string} threadId - ID of the thread to update.
 * @returns {Promise<void>} - Resolves when the document update completes.
 */
export async function updateThreadTimestamp(threadId) {
  const threadRef = doc(db, "threads", threadId);
  await updateDoc(threadRef, {
    updatedAt: serverTimestamp(),
  });
}

/**
 * Fetch all threads from Firestore.
 * @returns {Promise<Array<{id: string, userId?: string, chunk?: any, createdTime: Date|null}>>}
 */
export async function fetchThreads() {
  try {
    const colRef = collection(db, "threads");
    const snapshot = await getDocs(colRef);

    const threads = snapshot.docs.map(docSnap => {
      const data = docSnap.data();

      return {
        id: docSnap.id,
        userId: data.userId,
        chunk: data.chunk,
        createdTime: data.createdAt?.toDate() ?? null,
        // updatedTime: data.updatedAt?.toDate() ?? null,
      };
    });

    return threads;
  } catch (error) {
    console.error("Error fetching threads:", error);
    throw error;
  }
}