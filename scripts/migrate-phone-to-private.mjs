// One-shot: copy users/{uid}.phoneNumber to users/{uid}/private/contact
// then deleteField from the main doc. Idempotent — skips users that
// already have no phoneNumber on the main doc.
//
// Run with:
//   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
//   node scripts/migrate-phone-to-private.mjs

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

    let migrated = 0;
    let skipped = 0;
    for (const doc of snap.docs) {
        const data = doc.data();
        if (typeof data.phoneNumber !== 'string' || data.phoneNumber.trim() === '') {
            skipped++;
            continue;
        }

        // Write the private subcollection doc + delete the public field
        // in a single batch so partial state is impossible.
        const batch = db.batch();
        batch.set(
            doc.ref.collection('private').doc('contact'),
            { phoneNumber: data.phoneNumber },
            { merge: true },
        );
        batch.update(doc.ref, { phoneNumber: FieldValue.delete() });
        await batch.commit();

        migrated++;
        console.log(`✓ migrated phone for users/${doc.id}`);
    }
    console.log(`\nDone. Migrated ${migrated}, skipped ${skipped} of ${snap.size} docs.`);
}

run().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
