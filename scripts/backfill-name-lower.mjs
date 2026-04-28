// One-shot backfill: populate users/{uid}.nameLower and lastNameLower for
// users that don't have them. New users get these set on signup via
// deriveUserSearchFields() — but accounts that haven't logged in since the
// search-fields rollout are missing them and therefore invisible to user
// search until they next sign in. This script fixes that.
//
// Idempotent — skips users whose nameLower/lastNameLower already match what
// would be derived. Mirrors the diacritic-stripping logic in
// src/utils/searchFields.ts.
//
// Run with:
//   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
//   node scripts/backfill-name-lower.mjs

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({
    credential: applicationDefault(),
    projectId: 'alen-8797d',
});

const db = getFirestore();

const DIACRITICS_RE = /[̀-ͯ]/g;
const stripDiacritics = (s) =>
    s.normalize('NFKD').replace(DIACRITICS_RE, '').toLowerCase().trim();

function deriveUserSearchFields({ name, lastName }) {
    const out = {};
    if (name) out.nameLower = stripDiacritics(name);
    if (lastName) {
        out.lastNameLower = stripDiacritics(lastName);
    } else if (name) {
        const parts = name.trim().split(/\s+/);
        if (parts.length > 1) {
            out.lastNameLower = stripDiacritics(parts[parts.length - 1]);
        }
    }
    return out;
}

async function run() {
    const snap = await db.collection('users').get();
    console.log(`Found ${snap.size} user docs.`);

    let updated = 0;
    let skipped = 0;
    let missingName = 0;

    for (const userDoc of snap.docs) {
        const data = userDoc.data();
        const name = data.name || data.firstName;
        const lastName = data.lastName;

        if (!name) {
            missingName++;
            continue;
        }

        const derived = deriveUserSearchFields({ name, lastName });

        // Skip if both fields already match what we'd write.
        const nameOk = !derived.nameLower || data.nameLower === derived.nameLower;
        const lastOk = !derived.lastNameLower || data.lastNameLower === derived.lastNameLower;
        if (nameOk && lastOk) {
            skipped++;
            continue;
        }

        const patch = {};
        if (derived.nameLower && data.nameLower !== derived.nameLower) {
            patch.nameLower = derived.nameLower;
        }
        if (derived.lastNameLower && data.lastNameLower !== derived.lastNameLower) {
            patch.lastNameLower = derived.lastNameLower;
        }

        await userDoc.ref.set(patch, { merge: true });
        updated++;
        console.log(`  ${userDoc.id}: ${JSON.stringify(patch)}`);
    }

    console.log(`\nDone. updated=${updated}  skipped=${skipped}  missingName=${missingName}`);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
