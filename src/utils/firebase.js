// src/utils/firebase.js
import { initializeApp } from "firebase/app";
import { 
    getFirestore//, collection, getDocs
    } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyB_l8tNgPsNrzwE4c1fCzNqzQ0PrB9EBI0",
    authDomain: "ajeer-ai-test-02.firebaseapp.com",
    projectId: "ajeer-ai-test-02",
    storageBucket: "ajeer-ai-test-02.firebasestorage.app",
    messagingSenderId: "625607702045",
    appId: "1:625607702045:web:a563183f14d85f2afb38f4"
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Init services (read & write)
const db = getFirestore(app);

// // Collection Ref
// const colRef = collection(db, 'theadId');

// // get collection data
// getDocs(colRef)
//     .then((snapshot) => {
//         console.log(snapshot.docs)
//     });


// const querySnapshot = await getDocs(collection(db, "thredId"));
// querySnapshot.forEach(docSnap => {
//   console.log(docSnap.id, "=>", docSnap.data());
// });


export { app, db };
