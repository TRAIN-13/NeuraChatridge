// src/services/threadService.js
import { db } from "../utils/firebase.js";
import { doc, collection, addDoc,getDocs , setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

/**
 * تنشئ وثيقة جديدة في collection `threads`
 * @param {string?} userId
 * @returns {Promise<string>} الـ threadId الجديد
 */


export async function createThread(userId, threadId) {
  const threadRef = doc(db, "threads", threadId);
  const data = {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  if (userId) data.userId = userId;
  await setDoc(threadRef, data);
}


export async function updateThreadTimestamp(threadId) {
  const threadRef = doc(db, "threads", threadId);
  await updateDoc(threadRef, {
    updatedAt: serverTimestamp()
  });
}


export async function fetchThreads() {
  try {
    const colRef = collection(db, "threads");
    const snapshot = await getDocs(colRef);

    // نبني قائمة من الكائنات نقوم فيها بتحويل الـ Timestamps
    const threads = snapshot.docs.map(docSnap => {
      const data = docSnap.data();

      return {
        id:          docSnap.id,               // ← هنا اسم المستند
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




// export async function listAllThreads() {
//   const threadsSnap = await getDocs(collection(db, "threads"));
//   return threadsSnap.docs.map(doc => ({
//     id: doc.id,
    
//     createdAt: doc.data().createdAt?.toDate?.() ?? null
//   }));
// }

// مثال للاستخدام
//listAllThreads().then(threads => console.log(threads));
