import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, indexedDBLocalPersistence, type Auth } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

// ── Project configs ──────────────────────────────────────────────────
// Firebase web API keys identify the project, not authenticate it; real
// security lives in firestore.rules / storage.rules. Keeping both configs
// in source is normal practice and makes the env switch a single boolean
// flip with no .env file management.
//
// Switching environments:
//   - Default builds run against PROD.
//   - `npm run dev -- --mode staging` (or any tooling that sets
//     VITE_FIREBASE_ENV=staging) selects STAGING_CONFIG below.
//   - For deploys via the Firebase CLI, switch the CLI alias too:
//     `firebase use prod`  / `firebase use staging`.
//
// See docs/staging-setup.md for the full one-time setup once the
// alen-staging Firebase project has been created.

const PROD_CONFIG = {
    apiKey: "AIzaSyB57RQnpDMy76j0n4uNKy7XMXF1Xq_YeWc",
    authDomain: "alen-8797d.firebaseapp.com",
    projectId: "alen-8797d",
    storageBucket: "alen-8797d.firebasestorage.app",
    messagingSenderId: "692715228685",
    appId: "1:692715228685:web:06e187275e6ba4b131cf44",
    databaseURL: "https://alen-8797d-default-rtdb.europe-west1.firebasedatabase.app",
};

// TODO: replace these placeholders with the values from the staging
// Firebase project's General → Web app settings, after the project is
// created. Until then, leaving VITE_FIREBASE_ENV unset (the default)
// keeps the app pointed at prod.
const STAGING_CONFIG = {
    apiKey: "REPLACE_WITH_STAGING_API_KEY",
    authDomain: "alen-staging.firebaseapp.com",
    projectId: "alen-staging",
    storageBucket: "alen-staging.firebasestorage.app",
    messagingSenderId: "REPLACE_WITH_STAGING_SENDER_ID",
    appId: "REPLACE_WITH_STAGING_APP_ID",
    databaseURL: "https://alen-staging-default-rtdb.europe-west1.firebasedatabase.app",
};

const useStaging = import.meta.env.VITE_FIREBASE_ENV === 'staging';
const firebaseConfig = useStaging ? STAGING_CONFIG : PROD_CONFIG;

if (useStaging && firebaseConfig.apiKey.startsWith('REPLACE_WITH_')) {
    // Hard-fail on a half-configured staging build so we never accidentally
    // ship the placeholder values or fall back silently to prod.
    throw new Error(
        '[firebase] VITE_FIREBASE_ENV=staging but STAGING_CONFIG still has placeholder values. ' +
        'Fill in src/services/firebase.ts STAGING_CONFIG from the alen-staging Firebase project settings.'
    );
}

export const app = initializeApp(firebaseConfig);

// On native (Capacitor iOS/Android), the default `getAuth` triggers gapi.iframes
// loading from apis.google.com which fails CORS on the `capacitor://localhost`
// origin and breaks app startup. Use IndexedDB persistence to skip that path.
export const auth: Auth = Capacitor.isNativePlatform()
    ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
    : getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'europe-west1');

// Surface the active environment so on-screen banners (e.g. "STAGING")
// or analytics events can disambiguate where they're running.
export const FIREBASE_ENV: 'prod' | 'staging' = useStaging ? 'staging' : 'prod';
