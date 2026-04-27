// One-shot: remove the legacy `email` field from every users/{uid} doc.
// Run with: node scripts/cleanup-email-from-users.mjs
//
// Requires service-account credentials. Two options:
//  1. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON file
//     downloaded from
//     https://console.firebase.google.com/project/alen-8797d/settings/serviceaccounts/adminsdk
//  2. Run from a machine where `gcloud auth application-default login` has
//     been done with an account that has Firestore admin access.
//
// Idempotent — safe to re-run; only deletes the field if present.

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp({
    credential: applicationDefault(),
    projectId: 'alen-8797d',
});

const db = getFirestore();

async function run() {
    const snap = await db.collection('users').get();
    console.log(`Found ${snap.size} user docs.`);

    let cleaned = 0;
    for (const doc of snap.docs) {
        const data = doc.data();
        if (data.email !== undefined) {
            await doc.ref.update({ email: FieldValue.delete() });
            cleaned++;
            console.log(`✓ removed email from users/${doc.id}`);
        }
    }
    console.log(`\nDone. Cleaned ${cleaned} of ${snap.size} docs.`);
}

run().catch(err => {
    console.error('Cleanup failed:', err);
    process.exit(1);
});
