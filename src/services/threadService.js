// src/services/threadService.js
import { db } from "../utils/firebase.js";
import { collection, getDocs } from "firebase/firestore";

export async function fetchThreads() {
  try {
    const colRef = collection(db, "theadId");
    const snapshot = await getDocs(colRef);

    // نبني قائمة من الكائنات نقوم فيها بتحويل الـ Timestamps
    const threads = snapshot.docs.map(docSnap => {
      const data = docSnap.data();

      return {
        id: docSnap.id,
        // باقي الحقول كما خزّنتها
        userId: data.userId,
        chunk: data.chunk,

        // حول CreatedTime (Firestore Timestamp) إلى JavaScript Date
        createdTime: data.createdTime
          ? data.createdTime.toDate()
          : null,

        // حول updatedTime أيضاً
        updatedTime: data.updatedTime
          ? data.updatedTime.toDate()
          : null,
      };
    });

    return threads;
  } catch (error) {
    console.error("Error fetching threads:", error);
    throw error;
  }
}