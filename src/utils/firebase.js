// src/utils/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDtdlNo5rFIKrzwwXhOW2Ih8qyefRNr4s8",
    authDomain: "ajeer-ai-test-03.firebaseapp.com",
    projectId: "ajeer-ai-test-03",
    storageBucket: "ajeer-ai-test-03.firebasestorage.app",
    messagingSenderId: "170968575724",
    appId: "1:170968575724:web:b3845e37efa27ccf61ffc9",
    measurementId: "G-G9KC7PL8KQ"
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig);
//console.log(app);
// Init services (read & write)
const db = getFirestore(app);


export { app, db };
