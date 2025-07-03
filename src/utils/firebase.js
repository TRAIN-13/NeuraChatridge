// src/utils/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyA7CfdsI8UHkOY8vC0_xuBQxPYjVSGOtK0",
    authDomain: "ajeer-ai-test-04.firebaseapp.com",
    projectId: "ajeer-ai-test-04",
    storageBucket: "ajeer-ai-test-04.firebasestorage.app",
    messagingSenderId: "540748174884",
    appId: "1:540748174884:web:bb9a5b523f5e3b108beab1",
    measurementId: "G-Y2BZRRDQWD"
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig);
//console.log(app);
// Init services (read & write)
const db = getFirestore(app);


export { app, db };
