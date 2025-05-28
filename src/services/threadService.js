// src/services/threadService.js
import { db } from "../utils/firebase.js";
import { doc, collection, addDoc,getDocs , setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

/**
 * Create document in collection `threads`
 * @param {string?} userId
 * @returns {Promise<string>} new threadId
 */


export async function createFSThread(userId, threadId) {
  const threadRef = doc(db, "threads", threadId);
  //console.log("db: ",db);
  const data = {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  //console.log("data: ",data)
  if (userId) data.userId = userId;
  await setDoc(threadRef, data);
}


export async function updateThreadTimestamp(threadId) {
  const threadRef = doc(db, "threads", threadId);
  await updateDoc(threadRef, {
    updatedAt: serverTimestamp()
  });
}





// To Check connect in console
export async function fetchThreads() {
  try {
    const colRef = collection(db, "threads");
    const snapshot = await getDocs(colRef);

    // نبني قائمة من الكائنات نقوم فيها بتحويل الـ Timestamps
    const threads = snapshot.docs.map(docSnap => {
      const data = docSnap.data();

      return {
        id:          docSnap.id,              
        userId:      data.userId,
        chunk:       data.chunk,
        createdTime: data.createdAt?.toDate() ?? null,
        //updatedTime: data.updatedAt?.toDate() ?? null,
      };
      
    });

    return threads;
  } catch (error) {
    console.error("Error fetching threads:", error);
    throw error;
  }
}
