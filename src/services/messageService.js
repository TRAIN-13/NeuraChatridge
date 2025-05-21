// src/services/messageService.js
import { db } from "../utils/firebase.js";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

/**
 * تضيف رسالة (user أو assistant) في subcollection
 * threads/{threadId}/messages
 * @param {string} threadId
 * @param {"user"|"assistant"} author
 * @param {string} content
 * @returns {Promise<string>} الـ messageId الجديد
 */
export async function addMessage(threadId, author, content) {
  const msgsCol = collection(db, `threads/${threadId}/messages`);
  const docRef = await addDoc(msgsCol, {
    author,                    // ← حقل author : "user" | "assistant"
    content,                   // ← حقل content : string
    createdAt: serverTimestamp() // ← حقل createdAt : Timestamp
  });
  return docRef.id;
}
