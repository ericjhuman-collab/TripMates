// One-off backfill: assign a username to every user that doesn't have one.
// Run BEFORE deploying the new firestore.rules (current prod rules are open,
// so the unauthenticated web-SDK can still write). After deploy, this would
// need admin SDK credentials.
//
// Usage:  node scripts/backfill-usernames.mjs

import { initializeApp } from 'firebase/app';
import {
    getFirestore, collection, getDocs, doc, getDoc, setDoc,
    runTransaction,
} from 'firebase/firestore';

const app = initializeApp({
    apiKey: 'AIzaSyB57RQnpDMy76j0n4uNKy7XMXF1Xq_YeWc',
    authDomain: 'alen-8797d.firebaseapp.com',
    projectId: 'alen-8797d',
});
const db = getFirestore(app);

// ── Same validation logic as src/services/username.ts ─────────────────────
const RESERVED = new Set([
    'admin', 'administrator', 'root', 'superuser', 'mod', 'moderator',
    'support', 'help', 'info', 'contact', 'team', 'staff',
    'tripmates', 'app', 'api', 'www', 'mail', 'no-reply', 'noreply',
    'me', 'you', 'self', 'profile', 'settings', 'login', 'signup', 'logout',
    'about', 'privacy', 'terms', 'legal', 'security',
]);

function normalizeUsername(raw) {
    if (!raw) return '';
    const ascii = raw
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
    const cleaned = ascii.replace(/[^a-z0-9._]/g, '');
    const collapsed = cleaned.replace(/([._])\1+/g, '$1');
    return collapsed.replace(/^[._]+|[._]+$/g, '');
}

function isValidUsername(name) {
    if (!name || name.length < 3 || name.length > 20) return false;
    if (!/^[a-z][a-z0-9._]{1,18}[a-z0-9]$/.test(name)) return false;
    if (/[._]{2}/.test(name)) return false;
    if (RESERVED.has(name)) return false;
    return true;
}

async function claimUsername(uid, name) {
    await runTransaction(db, async (tx) => {
        const lockRef = doc(db, 'usernames', name);
        const lockSnap = await tx.get(lockRef);
        if (lockSnap.exists()) {
            if (lockSnap.data()?.uid === uid) return;
            throw new Error('taken');
        }
        tx.set(lockRef, { uid, createdAt: Date.now() });
        tx.set(doc(db, 'users', uid), { username: name }, { merge: true });
    });
}

async function generateAndClaim(uid, seed, fallback) {
    let base = normalizeUsername(seed);
    if (base.length < 3 && fallback) base = normalizeUsername(fallback);
    if (base.length < 3) base = 'traveler';
    if (base.length > 16) base = base.slice(0, 16);
    const candidates = [base, ...Array.from({ length: 50 }, (_, i) => `${base}${i + 2}`)];
    for (const c of candidates) {
        if (!isValidUsername(c)) continue;
        try { await claimUsername(uid, c); return c; } catch { /* retry */ }
    }
    const random = `${base}${Math.floor(Math.random() * 900000) + 100000}`;
    await claimUsername(uid, random);
    return random;
}

// ── Main ───────────────────────────────────────────────────────────────────
const usersSnap = await getDocs(collection(db, 'users'));
console.log(`Found ${usersSnap.size} users.`);

let assigned = 0, skipped = 0, failed = 0;

for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const data = userDoc.data();
    if (data.username) {
        console.log(`  ↩  ${uid}  already has @${data.username}`);
        skipped++;
        continue;
    }
    const seed = data.firstName || data.name || data.fullName || data.email?.split('@')[0] || '';
    const fallback = data.email || uid;
    try {
        const username = await generateAndClaim(uid, seed, fallback);
        console.log(`  ✓  ${uid}  →  @${username}  (seed: ${seed || '(empty)'})`);
        assigned++;
    } catch (e) {
        console.error(`  ✗  ${uid}  failed:`, e.message);
        failed++;
    }
}

console.log(`\nDone: ${assigned} assigned, ${skipped} skipped, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
// Keep linter happy if setDoc unused above
void setDoc; void getDoc;
