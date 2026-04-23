import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: "AIzaSyB57RQnpDMy76j0n4uNKy7XMXF1Xq_YeWc",
    authDomain: "alen-8797d.firebaseapp.com",
    projectId: "alen-8797d",
    storageBucket: "alen-8797d.firebasestorage.app",
    messagingSenderId: "692715228685",
    appId: "1:692715228685:web:06e187275e6ba4b131cf44",
    databaseURL: "https://alen-8797d-default-rtdb.europe-west1.firebasedatabase.app"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);
